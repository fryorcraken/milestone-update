const {Octokit} = require("octokit");
const {
    getRepos, getMilestones, lastWeekIso, getNewestCommentFirst, isWeeklyUpdateComment, cleanUpdate, formatWeeklyReport
} = require("./lib");


async function main() {
    const TOKEN = process.env.GH_TOKEN

    if (!TOKEN) {
        throw new Error("GitHub Token needed to access repo comments." +
            " Use `repo` scope for public and private repositories," +
            "`public_repo` for only public repositories")
    }

    const octokit = new Octokit({
        auth: TOKEN
    });

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


main().then(() => console.log("done."));
