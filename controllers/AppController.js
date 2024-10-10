import { redisClient } from '../utils/redis';
import { dbClient } from '../utils/db';

export default class AppController {
  static getStatus(request, response) {
    response.status(200).json({
      redis: redisClient.isAlive(),
      db: dbClient.isAlive(),

    });
  }

  static getStats(request, response) {
    Promise.all([dbClient.nbUsers(), dbClient.nbFiles()])
      .then(([usersCount, filesCount]) => {
        response.status(200).json({ users: usersCount, files: filesCount });
      });
  }
}
