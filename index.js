const {
    getRepos, getMilestones, lastWeekIso, getNewestCommentFirst, isWeeklyUpdateComment, cleanUpdate, formatWeeklyReport,
    getOctokit, formatMilestoneList
} = require("./lib");
const {program} = require('commander');

program.name("milestone")
program.command("weekly")
    .description("print weekly update report")
    .action(async() => {
        await weekly()
    })
program.command("list")
    .description("list milestones")
    .action(async () => {
        await list()
    })

program.parse()

async function weekly() {
    const octokit = getOctokit();

    const ORG = "waku-org"

    // Get all repositories
    const repos = await getRepos(octokit, ORG);

    // Create `update` object, one entry per repo
    const updates = {}

    for (const repo of repos) {
        // Get all milestones from the repository.
        const milestones = await getMilestones(octokit, ORG, repo)
        // console.debug("milestones", milestones)
        // console.debug("milestones", milestones.map(m => [m.title, m.number]))

        // Only care about comments made in the last week
        const lastWeek = lastWeekIso()

        // For each milestone, get the waku update
        for (const milestone of milestones) {
            const comments = await getNewestCommentFirst(octokit, milestone, repo, lastWeek);

            let weeklyUpdate
            for (const comment of comments) {
                if (isWeeklyUpdateComment(comment)) {
                    weeklyUpdate = cleanUpdate(comment.body)
                    break
                }
            }

            // Store the result in `updates`
            if (weeklyUpdate) {
                if (!updates[repo.name]) {
                    updates[repo.name] = []
                }
                updates[repo.name].push({milestone, update: weeklyUpdate})
            }
        }
    }
    const text = formatWeeklyReport(ORG, repos, updates);

    console.log("UPDATE:\n" + text)
}

async function list() {
    const octokit = getOctokit();

    const ORG = "waku-org"

    // Get all repositories
    const repos = await getRepos(octokit, ORG);

    const repoMilestones = new Map()

    for (const repo of repos) {
        // Get all milestones from the repository.
        const milestones = await getMilestones(octokit, ORG, repo)

        repoMilestones.set(repo.full_name, milestones)
    }

    const text = formatMilestoneList(repoMilestones);

    console.log(text)
}
