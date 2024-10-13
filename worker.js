import Bull from 'bull';
import thumbnail from 'image-thumbnail';
import fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import { dbClient } from './utils/db'; // Import your DB client

// Create a queue fileQueue
const fileQueue = new Bull('fileQueue', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
});

// Process the queue
fileQueue.process(async (job) => {
  const { userId, fileId } = job.data;

  // Check for missing fields
  if (!fileId) throw new Error('Missing fileId');
  if (!userId) throw new Error('Missing userId');

  // Find the file in the database
  const fileDocument = await dbClient.client.db().collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });

  // Check if the file document exists
  if (!fileDocument) {
    throw new Error('File not found');
  }

  const originalFilePath = path.join('/tmp/files_manager', fileDocument.name); // Adjust folder path if needed

  // Generate thumbnails
  const sizes = [500, 250, 100];
  await Promise.all(sizes.map(async (size) => {
    const thumbnailOptions = { width: size, responseType: 'buffer' };
    const thumbnailBuffer = await thumbnail(originalFilePath, thumbnailOptions);

    // Save thumbnail to disk
    const thumbnailPath = `${originalFilePath}_${size}`; // Save with size appended
    fs.writeFileSync(thumbnailPath, thumbnailBuffer);
  }));
});

// Start the worker (this keeps the worker alive)
console.log('Thumbnail worker started and listening for jobs...');
