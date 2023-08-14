const {
    getRepos, getMilestones, lastWeekIso, getNewestCommentFirst, isWeeklyUpdateComment, cleanUpdate, formatWeeklyReport,
    getOctokit, formatMilestoneList, getEpicLabel, getEpics, formatMilestoneByEpicList
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

program.command("epics")
    .description("list by epics")
    .action(async () => {
        await listByEpic()
    })

program.parse()

async function weekly() {
    const octokit = getOctokit();

    const org = "waku-org"
    const epicRepo = "pm"

    // Create `update` object, one entry per repo
    const updates = {}

    // Only care about comments made in the last week
    const lastWeek = lastWeekIso()

    // Collect Epic updates
    const epics = await getEpics(octokit, org, epicRepo)

    // For each epic, get the weekly update
    for (const epic of epics) {
        const comments = await getNewestCommentFirst(octokit, epic, epicRepo, lastWeek);

        let weeklyUpdate
        for (const comment of comments) {
            if (isWeeklyUpdateComment(comment)) {
                weeklyUpdate = cleanUpdate(comment.body)
                break
            }
        }

        // Store the result in `updates`
        if (weeklyUpdate) {
            if (!updates[epicRepo]) {
                updates[epicRepo] = []
            }
            updates[epicRepo].push({milestone: epic, update: weeklyUpdate})
        }
    }

    // Collect milestones updates
    const repos = await getRepos(octokit, org);

    for (const repo of repos) {
        // Get all milestones from the repository.
        const milestones = await getMilestones(octokit, org, repo)

        // For each milestone, get the weekly update
        for (const milestone of milestones) {
            const comments = await getNewestCommentFirst(octokit, milestone, repo.name, lastWeek);

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
    const text = formatWeeklyReport(org, repos, updates);

    console.log(text)
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

async function listByEpic() {
    const octokit = getOctokit();

    const org = "waku-org"
    const epicRepo = "pm"

    // Get all repositories
    const repos = await getRepos(octokit, org);

    // Get all epics
    const epics = await getEpics(octokit, org, epicRepo)

    const epicMilestones = new Map()

    for (const repo of repos) {
        // Get all milestones from the repository.
        const milestones = await getMilestones(octokit, org, repo, {state: "all"})

        for (let milestone of milestones) {
            const epicLabel = getEpicLabel(milestone)

            milestone.repo_name = repo.name

            let _m = epicMilestones.get(epicLabel)
            if (!_m) {
                _m = []
            }
            _m.push(milestone)
            epicMilestones.set(epicLabel, _m)
        }
    }

    const text = formatMilestoneByEpicList(epics, epicMilestones);

    console.log(text)
}
