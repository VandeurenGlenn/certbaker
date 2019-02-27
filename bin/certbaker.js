#!/usr/bin/env node

const commander = require('commander');
const chalk = require('chalk');
const { join, resolve } = require('path');
const util = require('util');
const fs = require('fs');
const bakeCommand = require('../lib/commands/bake');
const listCommand = require('../lib/commands/list');
const pkg = require('../package.json');
const OpenSSL = require('../lib/OpenSSL');
const { APP_DIR } = require('../lib/constants');

const stat = util.promisify(fs.stat);
const mkdir = util.promisify(fs.mkdir);

const { log } = console;
const generateRootCA = async (cmd, options) => {
  const dir = cmd ? cmd : APP_DIR;
  try {
    await OpenSSL.generateRootCA(dir, options)
    return console.log(`Initialized rootCA @${dir}`);
  } catch (error) {
    if (error.message !== 'CB_CERTEXISTS') {
      log(error);
    }
  }
}
commander
  .version(pkg.version)
  .description(pkg.description);

commander
  .command('bake <common_name>')
  .usage('<common_name> [options]')
  .description('Bake a new certificate using the given common name.')
  .alias('b')
  .option('-d, --directory [directory]', 'rootCA directory')
  .option('-c, --country [country]', 'Subject country')
  .option('-s, --state [state]', 'Subject state')
  .option('-o, --organization [organization]', 'Subject organization')
  .option('-f, --force [force]', 'Force the creation of the certificate, even if it already exists.')
  .action(bakeCommand)
  .on('--help', () => {
    log('');
    log('  Examples:');
    log('');
    log('    $ certbaker generate dev.example.com');
    log('    $ certbaker generate dev.example.com -f');
    log('');
  });

commander
  .command('list')
  .alias('l')
  .description('List the generated certificates.')
  .action(listCommand);

commander
  .command('init')
  .description('Generate a new root certificate and key.')
  .alias('i')
  .option('-c, --country [country]', 'Subject country')
  .option('-s, --state [state]', 'Subject state')
  .option('-o, --organization [organization]', 'Subject organization')
  .option('-f, --force [force]', 'Force the creation of the certificate, even if it already exists.')
  .action(generateRootCA);

(async () => {
  try {

    let directory;
    // Initialize the application
    try {
      let i = process.argv.indexOf('-d');
      if (i === -1) i = process.argv.indexOf('--directory');
      directory = i !== -1 ? join(APP_DIR, process.argv[i + 1]) : APP_DIR;
      await stat(directory)
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create a new directory for the app in the users home directory.
        await mkdir(APP_DIR, 0o777);
      } else {
        throw error;
      }
    }

    const rootCA = resolve(directory, 'rootCA.pem');
    try {
      await stat(rootCA)
    } catch (error) {
      let args;
      if (error.code === 'ENOENT') {
        // Generate a new root certificate and key
        args = process.argv;
        let i = args.indexOf('init');
        if (i === -1) args = ['init', ...args];
        i = args.indexOf('b');
        if (i !== -1) args.slice(i, 1);
        i = args.indexOf('l');
        if (i !== -1) args.slice(i, 1);
        await commander.parse(args);
      } else {
        throw error;
      }
    }
    await commander.parse(process.argv);

    if (!commander.args.length) {
      commander.help();
    }
  } catch (error) {
    if (error.code === 'ENOENT') log(`${chalk.red('✗')}' Could not find OpenSSL, make sure it is installed and accessible.`)
    else log(error);
  }
})();
