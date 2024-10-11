import dbClient from '../utils/db';

import crypto from 'crypto'

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

        const hashedPassword = crypto.createHash('sha1').update(password).digest('hex')



        const insertUser = await dbClient.client.db().collection('users').insertOne({ email, password: hashedPassword });

        return response.status(201).json({
            id: insertUser.insertedId,
            email: email
        })

    }
}
