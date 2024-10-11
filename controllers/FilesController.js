import { v4 as uuidv4 } from 'uuid';
import fs, { promises as fsPromises } from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import { dbClient } from '../utils/db';
import { redisClient } from '../utils/redis';

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
}
