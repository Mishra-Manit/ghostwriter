const path = require('path');

module.exports = {
    entry: './src/content/content.js',
    output: {
        filename: 'content.bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
    mode: 'production',
    resolve: {
        extensions: ['.js'],
    },
    // Required for InboxSDK
    optimization: {
        minimize: true,
    },
};
