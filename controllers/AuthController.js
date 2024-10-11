import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { redisClient } from '../utils/redis';
import { dbClient } from '../utils/db';

export default class AuthController {
  static async getConnect(request, response) {
    const { authorization } = request.headers;
    if (!authorization || !authorization.startsWith('Basic ')) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const base64credentials = authorization.split(' ')[1];
    const credentials = Buffer.from(base64credentials, 'base64').toString('ascii');
    const [email, password] = credentials.split(':');

    const existingUser = await dbClient.client.db().collection('users').findOne({ email });
    if (!existingUser) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');
    if (hashedPassword !== existingUser.password) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const token = uuidv4();
    await redisClient.set(`auth_${token}`, existingUser._id.toString(), 24 * 60 * 60);

    return response.status(200).json({ token });
  }

  static async getDisconnect(request, response) {
    const token = request.headers['x-token'];

    await redisClient.del(`auth_${token}`);
    response.status(204).send();
  }
}
