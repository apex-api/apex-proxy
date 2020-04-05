const AWS = require('aws-sdk');
const uuid = require('uuid');

const config = new AWS.Config({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	region: process.env.AWS_REGION
})