const {
    getRepos,
    getMilestones,
    lastFiveDaysIso,
    getNewestCommentFirst,
    isWeeklyUpdateComment,
    cleanUpdate,
    formatWeeklyReport,
    getOctokit,
    formatMilestoneList,
    getMilestoneLabel,
    getEpics,
    formatMilestoneByEpicList,
    wasUpdatedInMonth,
    formatMonthlyReport
} = require("./lib");
const {program} = require('commander');

program.name("milestone")
program.command("weekly")
    .description("print weekly update report")
    .action(async() => {
        await weekly()
    })
program.command("epics")
    .description("list epics")
    .action(async () => {
        await listEpics()
    })

program.command("milestones")
    .description("list all epics by milestones")
    .action(async () => {
        await listByMilestone()
    })

program.command("month <month>")
    .description("print monthly report")
    .action(async (m) => {
        await month(m)
    })

program.parse()

async function weekly() {
    const octokit = getOctokit();

    const org = "waku-org"
    const milestoneRepo = "pm"

    // Create `update` object, one entry per repo
    const updates = {}

    // Only care about comments made in the last week
    const lastWeek = lastFiveDaysIso()

    // Collect Milestones updates
    const milestones = await getMilestones(octokit, org, milestoneRepo, {state: "all", since: lastWeek})

    // For each epic, get the weekly update
    for (const milestone of milestones) {
        const comments = await getNewestCommentFirst(octokit, milestone, milestoneRepo, lastWeek);

        let weeklyUpdate
        for (const comment of comments) {
            if (isWeeklyUpdateComment(comment)) {
                weeklyUpdate = cleanUpdate(comment.body)
                break
            }
        }

        // Store the result in `updates`
        if (weeklyUpdate) {
            if (!updates[milestoneRepo]) {
                updates[milestoneRepo] = []
            }
            updates[milestoneRepo].push({epic: milestone, update: weeklyUpdate})
        }
    }

    // Collect epic updates
    const repos = await getRepos(octokit, org);

    for (const repo of repos) {
        // Get all epics from the repository.
        const epics = await getEpics(octokit, org, repo.name, {state: "all", since: lastWeek})

        // For each epic, get the weekly update
        for (const epic of epics) {
            const comments = await getNewestCommentFirst(octokit, epic, repo.name, lastWeek);

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
                updates[repo.name].push({epic, update: weeklyUpdate})
            }
        }
    }
    const text = formatWeeklyReport(org, repos, updates);

    console.log(text)
}

async function month(m) {
    const octokit = getOctokit();

    const org = "waku-org"
    const milestoneRepo = "pm"

    const monthIndex = m - 1

    // Get all milestones
    const milestones = await getMilestones(octokit, org, milestoneRepo)

    const milestoneToEpics = new Map()

    // Get all repositories
    const repos = await getRepos(octokit, org);
    for (const repo of repos) {
        // Get all milestones from the repository.
        const epics = await getEpics(octokit, org, repo.name, {state: "all"})

        for (let epic of epics) {
            const milestoneLabel = getMilestoneLabel(epic)

            epic.repo_name = repo.name

            let stateOfEpics = milestoneToEpics.get(milestoneLabel) ?? {open: [], closed: [], updated: []}
            if (epic.state === "open") {
                stateOfEpics.open.push(epic)
            } else {
                stateOfEpics.closed.push(epic)
            }
            if (wasUpdatedInMonth(monthIndex, epic)) {
                stateOfEpics.updated.push(epic)
            }

            milestoneToEpics.set(milestoneLabel, stateOfEpics)
        }
    }

    const text = formatMonthlyReport(milestones, milestoneToEpics);

    console.log(text)
}


async function listEpics() {
    const octokit = getOctokit();

    const ORG = "waku-org"

    // Get all repositories
    const repos = await getRepos(octokit, ORG);

    const repoMilestones = new Map()

    for (const repo of repos) {
        // Get all milestones from the repository.
        const milestones = await getEpics(octokit, ORG, repo.name)

        repoMilestones.set(repo.full_name, milestones)
    }

    const text = formatMilestoneList(repoMilestones);

    console.log(text)
}

async function listByMilestone() {
    const octokit = getOctokit();

    const org = "waku-org"
    const milestoneRepo = "pm"

    // Get all repositories
    const repos = await getRepos(octokit, org);

    // Get all milestones
    const milestones = await getMilestones(octokit, org, milestoneRepo)

    const milestoneToEpics = new Map()

    for (const repo of repos) {
        // Get all milestones from the repository.
        const epics = await getEpics(octokit, org, repo.name, {state: "all"})

        for (let epic of epics) {
            const milestoneLabel = getMilestoneLabel(epic)

            epic.repo_name = repo.name

            let _m = milestoneToEpics.get(milestoneLabel) ?? []
            _m.push(epic)
            milestoneToEpics.set(milestoneLabel, _m)
        }
    }

    const text = formatMilestoneByEpicList(milestones, milestoneToEpics);

    console.log(text)
}
