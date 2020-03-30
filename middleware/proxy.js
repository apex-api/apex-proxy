const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const yaml = require('js-yaml');
const apexLogger = require('./log');

const generateOutgoingRequestOptions = (incomingRequest) => {
  const incomingRequestPathWithQuery =
    incomingRequest.path + '?' + querystring.stringify(incomingRequest.query);

  return {
    method: incomingRequest.method,
    hostname: incomingRequest.headers['host'],
    port: 443,
    path: incomingRequestPathWithQuery,
    headers: incomingRequest.headers,
  };
};

const buildOutgoingResponse = (
  incomingResponse,
  incomingResponseBody,
  outgoingResponse,
) => {
  // console.log('incomingResponse: ', incomingResponse);
  outgoingResponse.status(incomingResponse.statusCode);
  outgoingResponse.set(incomingResponse.headers);
  outgoingResponse.locals.body = incomingResponseBody;
};

// Also add tracing and logging logic to the proxy
module.exports = () => {
  return (incomingRequest, outgoingResponse, next) => {
    // Extract reading config data to its own middleware?
    let config;

    try {
      config = yaml.safeLoad(fs.readFileSync('config/config.yml', 'utf8'));
    } catch (e) {
      console.log(e);
    }

    const TIMEOUT = config['timeout'];

    const outgoingRequestOptions = generateOutgoingRequestOptions(
      incomingRequest,
    );

    outgoingResponse.locals.sendOutgoingRequest = () => {
      return new Promise((resolve, reject) => {
        let timeoutId;

        const outgoingRequest = https.request(
          outgoingRequestOptions,
          (incomingResponse) => {
            const incomingResponseChunks = [];
            let incomingResponseBody;

            incomingResponse.on('data', (d) => {
              // Any other possibilities for how responses are sent, except for in chunks?
              // How about streams or, more generally, very large files?
              incomingResponseChunks.push(d);
            });

            incomingResponse.on('end', () => {
              // Ensure that we don't build outgoingResponse if outgoingRequest was aborted;
              // otherwise buildOutgoingResponse() below would throw error

              // console.log('incomingResponse: ', incomingResponse);

              console.log('in end');

              if (incomingResponse.aborted === false) {
                clearTimeout(timeoutId);

                incomingResponseBody = Buffer.concat(incomingResponseChunks);

                buildOutgoingResponse(
                  incomingResponse,
                  incomingResponseBody,
                  outgoingResponse,
                );

                apexLogger.sendLog(incomingResponse);

                resolve();
              }
            });
          },
        );

        outgoingRequest.on('error', (error) => {
          // console.error(error);
        });

        if (incomingRequest.body && typeof incomingRequest.body !== 'object') {
          outgoingRequest.write(incomingRequest.body);
        }

        // console.log('outgoingRequest.headers before apexLogger sends: ', outgoingRequest.headers);
        // apexLogger.sendLog({
        //   ...outgoingRequest,
        //   headers: outgoingRequestOptions.headers,
        // });

        outgoingRequest.end();

        timeoutId = setTimeout(() => {
          outgoingRequest.abort();

          console.log(`Timed out after ${TIMEOUT}ms\n`);

          reject(outgoingResponse.locals.sendOutgoingRequest);
        }, TIMEOUT);
      }).catch((e) => console.log(e));
    };

    // outgoingResponse.locals.sendFirstOutgoingRequest =
    //   outgoingResponse.locals.sendOutgoingRequest;

    next();
  };
};
