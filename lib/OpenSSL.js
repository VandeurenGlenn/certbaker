require('util.promisify/shim')();
const { spawn } = require('./helpers/cli');
const { join, resolve, isAbsolute } = require('path');
const fs = require('fs');
const util = require('util');
const dedent = require('dedent');
const chalk = require('chalk');
const { APP_DIR, SUB_DEFAULT } = require('./constants');
const { log } = require('./helpers/logger');

const stat = util.promisify(fs.stat);
const mkdir = util.promisify(fs.mkdir);
const writeFile = util.promisify(fs.writeFile);

module.exports = class OpenSSL {
  static getVersion() {
    return spawn('openssl', ['version']);
  }

  static async generateRootCA(exportPath, options) {
    if (typeof exportPath === 'object') {
      options = exportPath;
      exportPath = APP_DIR;
    } else if (!isAbsolute(exportPath)) {
      exportPath = join(APP_DIR, exportPath);
    }
    const { country, state, organization } = {
      ...SUB_DEFAULT,
      ...{
        country: options.country,
        state: options.state,
        organization: options.organization
      }
    };
    const rootCertPem = resolve(exportPath, 'rootCA.pem');
    const rootCertCrt = resolve(exportPath, 'rootCA.crt');
    const rootKey = resolve(exportPath, 'rootCA.key');

    const subj = `/C=${country}/ST=${state}/L=World/O=${organization} Dev Root CA/`;

    if (!options.force) {
      try {
        await stat(exportPath);
        log(dedent`
        ${chalk.red('✗')} Could not generate the certificate.

        There is already a certificate under that hostname, use ${chalk.bold('-f')} or ${chalk.bold('--force')} to override it.
        `);

        throw new Error('CB_CERTEXISTS');
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('ENOENT');
          // Create a new directory for the hostname in the home directory
          // to be able to store the generated files for that host.
          await mkdir(exportPath, 0o777);
          options.force = true;
          return this.generateRootCA(exportPath, options)
        } else {
          throw error;
        }
      }
    }
    await spawn('openssl', ['req',
      '-x509', '-nodes', '-new', '-sha256', '-days', '1024',
      '-newkey', 'rsa:2048', '-keyout', rootKey,
      '-out', rootCertPem, '-subj', subj,
    ])
    await spawn('openssl', ['x509',
      '-outform', 'der',
      '-in',
      rootCertPem,
      '-out',
      rootCertCrt,
    ]);
    return;
  }

  static generateCsr(commonName, exportPath, subj = {}) {
    const certKey = resolve(exportPath, `${commonName}.key`);
    const certCsr = resolve(exportPath, `${commonName}.csr`);
    const certExt = resolve(exportPath, `${commonName}.ext`);
    const { country, state, organization } = {
      ...SUB_DEFAULT,
      ...subj
    }

    subj = `/C=${country}/ST=${state}/L=World/O=${organization}/CN=${commonName}`;

    const opensslPromise = spawn('openssl', ['req',
      '-new',
      '-nodes',
      '-newkey',
      'rsa:2048',
      '-keyout',
      certKey,
      '-out',
      certCsr,
      '-subj',
      subj,
    ]);

    // Create an ext file that will be used for generating the certificate.
    // It ensures the certificate will be trusted by more clients.
    const extfilePromise = writeFile(certExt, dedent`
      authorityKeyIdentifier=keyid,issuer
      basicConstraints=CA:FALSE
      keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
      subjectAltName = @alt_names
      [alt_names]
      DNS.1 = ${commonName}
    `);

    return Promise.all([opensslPromise, extfilePromise]).then(() => ({
      certKey,
      certCsr,
      certExt,
    }));
  }

  static generateCertificate(certCsr, certKey, certExt, cert, dir) {
    const rootCA = resolve(dir ? dir : APP_DIR, 'rootCA.pem');
    const rootCAKey = resolve(dir ? dir : APP_DIR, 'rootCA.key');

    return spawn('openssl', ['x509',
      '-req', '-sha256', '-days', '1024',
      '-in',
      certCsr,
      '-CA',
      rootCA,
      '-CAkey',
      rootCAKey,
      '-CAcreateserial',
      '-extfile',
      certExt,
      '-out',
      cert,
    ]).then(() => ({
      cert,
      certKey,
    }));
  }

  static getCertificateDates(cert) {
    return spawn('openssl', ['x509',
      '-in',
      cert,
      '-dates',
      '-noout',
    ]).then((text) => {
      const splitExp = /([^=]+)=(.*)/;
      const data = {};
      text.split('\n').forEach((line) => {
        const lineData = splitExp.exec(line);
        if (lineData !== null) {
          const [key, value] = [lineData[1], lineData[2]];

          data[key] = value;
        }
      });

      return data;
    });
  }
};
