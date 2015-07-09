let env = process.env;

let config = {
    development: {
        baseUrl: 'http://192.168.30.21:3000/api/'
    },

    production: {
        baseUrl: 'http://soapee.com/api/'
    }
};

export default config[ env.NODE_ENV ];