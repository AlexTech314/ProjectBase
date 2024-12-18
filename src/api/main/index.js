const AWS = require('aws-sdk');
const mysql = require('mysql2/promise');

let secret;
let pool;
let corsOrigin;

exports.handler = async (event) => {
    const { DB_HOST, DB_PORT, DB_NAME, DB_SECRET_ARN, CORS_SECRET_ARN } = process.env;

    // Cache the secret on cold start
    if (!secret) {
        const secretsManager = new AWS.SecretsManager();
        const secretValue = await secretsManager.getSecretValue({ SecretId: DB_SECRET_ARN }).promise();
        secret = JSON.parse(secretValue.SecretString);
    }

    // Initialize the connection pool on cold start
    if (!pool) {
        pool = mysql.createPool({
            host: DB_HOST,
            port: DB_PORT,
            user: secret.username,
            password: secret.password,
            database: DB_NAME,
            waitForConnections: true,
            connectionLimit: 10, // Adjust based on your needs
            queueLimit: 0,
        });
    }

    if (!corsOrigin) {
        const secretsManager = new AWS.SecretsManager();
        const secretValue = await secretsManager.getSecretValue({ SecretId: CORS_SECRET_ARN }).promise();
        corsOrigin = secretValue.SecretString;
    }

    let connection;

    try {
        // Get a connection from the pool
        connection = await pool.getConnection();

        // Perform your query
        const [rows] = await connection.execute('SELECT NOW() AS now');

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': corsOrigin,
                'Access-Control-Allow-Methods': '*',
                'Access-Control-Allow-Headers': '*',
            },
            body: JSON.stringify(rows[0]),
        };
    } catch (error) {
        console.error('Database query failed:', error);
        corsOrigin = null;
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': corsOrigin,
                'Access-Control-Allow-Methods': '*',
                'Access-Control-Allow-Headers': '*',
            },
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    } finally {
        // Release the connection back to the pool
        if (connection) await connection.release();
    }
};
