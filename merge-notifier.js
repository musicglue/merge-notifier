const Octokat = require('octokat');

const github = new Octokat({
  username: process.env.GH_USERNAME,
  password: process.env.GH_PASSWORD,
});

const args = process.argv.slice(2);
if (args.length !== 3) {
  console.log('Usage:');
  console.log('merge-notifier <organisation> <repo> <pr number>');
  process.exit(1);
}

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

const mergeCommitRegex = /^merge pull request #(\d+)/i;

const isMergeCommit = ({ commit: { message } }) =>
  !!mergeCommitRegex.test(message)

const extractPullRequestNumber = ({ commit: { message } }) =>
  message.match(mergeCommitRegex)[1];

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
      .filter(isMergeCommit)
      .map(extractPullRequestNumber)
      .map(prNumber =>
        commentOnPR(args[0], args[1], prNumber, notificationMessage(pull)))))
  .catch(err => {
    console.log(err);
    process.exit(1);
  });
