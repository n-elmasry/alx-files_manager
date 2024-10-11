import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import { dbClient } from '../utils/db';
import { redisClient } from '../utils/redis';

export default class UsersController {
  static async postNew(request, response) {
    const { email, password } = request.body;

    if (!email) {
      return response.status(400).json({ error: 'Missing email' });
    }
    if (!password) {
      return response.status(400).json({ error: 'Missing password' });
    }

    const existingUser = await dbClient.client.db().collection('users').findOne({ email });
    if (existingUser) {
      return response.status(400).json({ error: 'Already exist' });
    }

    const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

    const insertUser = await dbClient.client.db().collection('users').insertOne({ email, password: hashedPassword });

    return response.status(201).json({
      id: insertUser.insertedId,
      email,
    });
  }

  static async getMe(request, response) {
    const token = request.headers['x-token'];

    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    const user = await dbClient.client.db().collection('users').findOne({ _id: ObjectId(userId) });

    return response.status(200).json({ email: user.email, id: user._id });
  }
}
