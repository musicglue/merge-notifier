#!/usr/bin/env node

const Octokat = require('octokat');

const mergeCommitRegex = /^merge pull request #(\d+)/i;

const isMergeCommit = message =>
  !!mergeCommitRegex.test(message)

const extractPullRequestNumber = message =>
  message.match(mergeCommitRegex)[1];

const github = new Octokat({
  username: process.env.GH_USERNAME,
  password: process.env.GH_PASSWORD,
});

if (process.argv.length !== 5) {
  console.log('Usage:');
  console.log('merge-notifier <organisation> <repo> <pr number or commit message>');
  process.exit(1);
}

const parseArgs = (organisation, repo, prNumber) => {
  if (/^\d+$/.test(prNumber)) return [organisation, repo, prNumber];
  if (isMergeCommit(prNumber)) return [organisation, repo, extractPullRequestNumber(prNumber)];
  console.log('Not a PR merge commit');
  process.exit(0);
};

const args = parseArgs(...process.argv.slice(2));

const fetchAllPaged = pagePromise =>
  pagePromise.then(page =>
    (page.nextPageUrl
      ? fetchAllPaged(page.nextPage()).then(rest => page.concat(rest))
      : page));

const fetchPull = (organisation, repo, prNumber) =>
  github
    .repos(organisation, repo)
    .pulls(prNumber)
    .fetch();

const fetchPullCommits = (organisation, repo, prNumber) =>
  fetchAllPaged(github
    .repos(organisation, repo)
    .pulls(prNumber)
    .commits
    .fetch());

const commentOnPR = (organisation, repo, prNumber, comment) =>
  github
    .repos(organisation, repo)
    .issues(prNumber)
    .comments
    .create({ body: comment });

const notificationMessage = pull =>
  `The code in this pull request was just merged into \`${pull.base.ref}\` from ` +
  `\`${pull.head.ref}\` by ${pull.mergedBy.login} as part of [${pull.title}](${pull.html.url}).`;

Promise
  .all([
    fetchPull(...args),
    fetchPullCommits(...args),
  ])
  .then(([pull, commits]) =>
    Promise.all(commits
      .map(({ commit }) => commit.message)
      .filter(isMergeCommit)
      .map(extractPullRequestNumber)
      .map(prNumber =>
        commentOnPR(args[0], args[1], prNumber, notificationMessage(pull)))))
  .catch(err => {
    console.log(err);
    process.exit(1);
  });
