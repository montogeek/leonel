'use strict';

const Promise = require('bluebird');
const request = require('superagent-bluebird-promise');
const moment = require('moment');
const debug = require('debug')('bot:invite');
const logError = require('debug')('bot:error');
const config = require('./config');

const token =  config.SLACK_ADMIN_TOKEN;
const teamName = config.SLACK_TEAM_NAME;
const orgUrl = `https://${teamName}.slack.com/api/users.admin.invite`;

function invite(bot, message) {
  debug('begin', message.match[1]);
  let guest = message.match[1];
  let host = message.user;
  let params = { email: guest, token };
  let getData = Promise.promisify(bot.botkit.storage.users.get);
  let saveData = Promise.promisify(bot.botkit.storage.users.save);
  let userData;

  return getData(host)
    .then((data) => {
      userData = data;
      return validatePermissions(data);
    })
    .then(() => request.post(orgUrl).type('form').send(params))
    .then(handleResponse)
    .then((invitation) => {
      debug('complete', invitation);

      bot.reply(message, invitation.reply);

      if (!Array.isArray(userData.guests)) {
        userData.guests = [];
      }

      userData.guests.push(invitation.log);

      if (invitation.log.result === 'ok') {
        userData.invites--;
      }

      return saveData(userData);
    })
    .catch(err => {
      debug('catch');
      let serverError = (err.res && err.res.statusCode !== 200);

      if (serverError) {
        err.reply = `El servidor respondió de mala gana con estatus ${err.res.statusCode}`;
      }

      if (err.reply) {
        logError('caught', err.reply);
        return bot.reply(message, err.reply);
      }

      logError('caught', err);
      return bot.reply(message, 'Error - esa invitación no funcionó, échele una miradita al log');
    });
}

function validatePermissions(data) {
  debug('validatePermissions');
  return new Promise((resolve, reject) => {
    if (!data) {
      return reject({ reply: 'Error - hubo un problema encontrando su cuenta' });
    }

    let validAge = moment().subtract(45, 'days');
    let accountAge = moment(data.createdAt);

    if (!accountAge.isSameOrBefore(validAge)) {
      let days = accountAge.diff(validAge, 'days');
      let reply = `Error - debes esperar ${days} días para poder invitar a otras personas`;
      return reject({ reply });
    }

    if (data.invites <= 0) {
      let reply = `Error - has agotado tus invitaciones mensuales, intenta de nuevo el 1ro del mes`;
      return reject({ reply });
    }

    resolve();
  });
}

function handleResponse(res) {
  debug('handleResponse', res.body);
  return new Promise((resolve, reject) => {
    let reply = '¡Invitación etsitosa!';
    let guest = res.request._data.email;
    let log;
    let result = 'ok';

    if (res.body.error) {
      result = res.body.error;
      if (res.body.error === 'already_invited') {
        reply = `Error - a ${guest} ya lo invitaron`;
      }

      if (res.body.error === 'already_in_team') {
        reply = `Error - ${guest} ya tiene cuenta en este Slack`;
      }
    }

    log = { guest, result };
    resolve({ reply, log });
  });
}

module.exports = invite;
