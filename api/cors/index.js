exports.handler = async (event) => {
    const allowedOrigin = process.env.ALLOWED_ORIGIN

    const origin = event.headers.origin || '*';

    // Check if the origin is allowed
    const isAllowedOrigin = allowedOrigin === '*' || allowedOrigin === origin;

    const response = {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'null',
            'Access-Control-Allow-Methods': '*',
            'Access-Control-Allow-Headers': '*',
        },
        body: 'OK',
    };

    return response;
};
