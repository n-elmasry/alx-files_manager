import { v4 as uuidv4 } from 'uuid';
import fs, { promises as fsPromises } from 'fs';
import path from 'path';
import mime from 'mime-types';
import { ObjectId } from 'mongodb';
import Queue from 'bull';
import { dbClient } from '../utils/db';
import { redisClient } from '../utils/redis';

const fileQueue = new Queue('fileQueue');

const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';

export default class FilesController {
  static async postUpload(request, response) {
    const token = request.headers['x-token'];

    // 1. Retrieve user from token
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = request.body;

    if (!name) {
      return response.status(400).json({ error: 'Missing name' });
    }

    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return response.status(400).json({ error: 'Missing type' });
    }

    if (!data && type !== 'folder') {
      return response.status(400).json({ error: 'Missing data' });
    }

    // const parentFile = null;

    if (parentId !== 0) {
      const parentFile = await dbClient.client.db().collection('files').findOne({ _id: ObjectId(parentId) });

      if (!parentFile) {
        return response.status(400).json({ error: 'Parent not found' });
      }
      if (parentFile.type !== 'folder') {
        return response.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // 5. Handle file or image type: save Base64 data to disk
    let filePath = null;
    if (type === 'file' || type === 'image') {
      const folderPath = FOLDER_PATH;
      if (!fs.existsSync(folderPath)) {
        await fsPromises.mkdir(folderPath, { recursive: true });
      }

      const fileUUID = uuidv4(); // Generate a unique ID for the file
      filePath = path.join(folderPath, fileUUID); // Create the full path

      // Write Base64 data to disk
      const decodedData = Buffer.from(data, 'base64');
      fs.writeFileSync(filePath, decodedData); // Save file to disk

      if (type === 'image') {
        const insertFile = await dbClient.client.db().collection('files').insertOne({
          userId: ObjectId(userId),
          name,
          type,
          parentId,
          isPublic,
          localPath: filePath, // Store the local path of the file in DB
        });

        // ** ADDITION: Add a job to the file processing queue **
        await fileQueue.add({
          userId,
          fileId: insertFile.insertedId.toString(),
        });
      }
    }

    const newFile = {
      userId: ObjectId(userId),
      name,
      type,
      parentId,
      isPublic,
    };

    const insertFile = await dbClient.client.db().collection('files').insertOne(newFile);

    const { _id, ...responseFile } = newFile;
    return response.status(201).json({ id: insertFile.insertedId, ...responseFile });
  }

  static async getShow(request, response) {
    const token = request.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = request.params.id;
    const document = await dbClient.client.db().collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });

    if (!document) {
      return response.status(404).json({ error: 'Not found' });
    }

    const responseFile = {
      id: document._id.toString(),
      userId: document.userId.toString(),
      name: document.name,
      type: document.type,
      isPublic: document.isPublic,
      parentId: document.parentId.toString(),
    };

    return response.json(responseFile);
  }

  static async getIndex(request, response) {
    const token = request.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const parentId = request.query.parentId || 0;
    const page = parseInt(request.query.page, 10) || 0;

    const pageSize = 20;
    const files = await dbClient.client.db().collection('files')
      .aggregate([
        { $match: { userId: ObjectId(userId), parentId: parseInt(parentId, 10) } },
        { $skip: page * pageSize },
        { $limit: pageSize },
      ])
      .toArray();

    const formattedFiles = files.map((file) => {
      const { _id, ...rest } = file;
      return { id: _id, ...rest };
    });

    return response.json(formattedFiles);
  }

  static async putPublish(request, response) {
    const token = request.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = request.params.id;
    const document = await dbClient.client.db().collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });

    if (!document) {
      return response.status(404).json({ error: 'Not found' });
    }

    await dbClient.client.db().collection('files').updateOne({ _id: ObjectId(fileId), userId: ObjectId(userId) },
      { $set: { isPublic: true } });

    const updatedFile = await dbClient.client.db().collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });

    const responseFile = {
      id: updatedFile._id.toString(),
      userId: updatedFile.userId.toString(),
      name: updatedFile.name,
      type: updatedFile.type,
      isPublic: updatedFile.isPublic,
      parentId: updatedFile.parentId.toString(),
    };

    return response.status(200).json(responseFile);
  }

  static async putUnpublish(request, response) {
    const token = request.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = request.params.id;
    const document = dbClient.client.db().collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });

    if (!document) {
      return response.status(404).json({ error: 'Not found' });
    }
    await dbClient.client.db().collection('files').updateOne({ _id: ObjectId(fileId), userId: ObjectId(userId) },
      { $set: { isPublic: false } });

    const updatedFile = await dbClient.client.db().collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
    const responseFile = {
      id: updatedFile._id.toString(),
      userId: updatedFile.userId.toString(),
      name: updatedFile.name,
      type: updatedFile.type,
      isPublic: updatedFile.isPublic,
      parentId: updatedFile.parentId.toString(),
    };

    return response.status(200).json(responseFile);
  }

  static async getFile(request, response) {
    const fileId = request.params.id;
    const document = await dbClient.client.db().collection('files').findOne({ _id: ObjectId(fileId) });

    if (!document) {
      return response.status(404).json({ error: 'Not found' });
    }

    const token = request.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!document.isPublic && (!userId || document.userId.toString() !== userId)) {
      return response.status(404).json({ error: 'Not found' });
    }

    if (document.type === 'folder') {
      return response.status(400).json({ error: "A folder doesn't have content" });
    }

    const { size } = request.query;
    let localPath = path.join(document.localPath);

    if (size) {
      const validSizes = ['500', '250', '100'];
      if (!validSizes.includes(size)) {
        return response.status(400).json({ error: 'Invalid size' });
      }
      localPath += `_${size}`; // Append the size to the local path
    }

    if (!fs.existsSync(localPath)) {
      return response.status(404).json({ error: 'Not found' });
    }

    const mimeType = mime.lookup(document.name) || 'application/octet-stream';

    const data = await fsPromises.readFile(localPath);
    response.setHeader('Content-Type', mimeType);
    return response.send(data);
  }
}
