const dedent = require('dedent');
const fs = require('fs');
const util = require('util');
const { resolve, join } = require('path');
const chalk = require('chalk');
const OpenSSL = require('../OpenSSL');
const { APP_DIR } = require('../constants');

const { log } = require('../helpers/logger');

module.exports = (cmd, options) => {
  const stat = util.promisify(fs.stat);
  const mkdir = util.promisify(fs.mkdir);
  const certDir = join(APP_DIR, options.dir ? options.dir : cmd, 'certificates');

  return stat(certDir)
    .then(() => {
      // If there is already a diectory for that certificate, force needs to be checked.
      // The flag needs to be set in order for us to override the certificate.
      if (options.force || options.f) {
        return true;
      }

      log(dedent`
      ${chalk.red('✗')} Could not generate the certificate.

      There is already a certificate under that hostname, use ${chalk.bold('-f')} or ${chalk.bold('--force')} to override it,
      or when baking another certificate for the same orgization, use ${chalk.bold('-d <organization>')} or ${chalk.bold('--directory <organization>')}
      `);

      return Promise.reject(new Error('CB_CERTEXISTS'));
    }, (err) => {
      if (err.code === 'ENOENT') {
        // Create a new directory for the hostname in the home directory
        // to be able to store the generated files for that host.
        return mkdir(certDir, 0o777);
      }

      return Promise.reject(err);
    })
    .then(() => OpenSSL.generateCsr(cmd, certDir, {
      country: options.country,
      state: options.state,
      organization: options.organization
    }))
    .then(csr => OpenSSL.generateCertificate(csr.certCsr, csr.certKey, csr.certExt, resolve(certDir, `${cmd}.crt`), options.directory))
    .then(({ cert, certKey }) => {
      // Output helper information on how to install the certificate
      log(dedent`
        ${chalk.green('✔')} Your key and certificate for ${chalk.bold(cmd)} were successfully baked :)

        The key and certificate were stored in ${chalk.italic(certDir)}.
        Check out the following snippets to install the certificates on your server:

        ${chalk.bold('Apache:')}
        SSLEngine on
        SSLCertificateFile ${cert}
        SSLCertificateKeyFile ${certKey}

        ${chalk.bold('Nginx:')}
        ssl_certificate     ${cert};
        ssl_certificate_key ${certKey};
        `);

      return true;
    })
    .catch((err) => {
      if (err.message !== 'CB_CERTEXISTS') {
        log(err);
      } else {
        return Promise.reject(err)
      }

      if (process.env.NODE_ENV === 'test') {
        return Promise.reject(err);
      }

      return Promise.resolve();
    });
};
