const {
    getRepos,
    getMilestones,
    lastFiveDaysIso,
    getNewestCommentFirst,
    isWeeklyUpdateComment,
    cleanUpdate,
    getOctokit,
    formatMilestoneList,
    getMilestoneLabel,
    getEpics,
    formatMilestoneByEpicList,
    wasUpdatedInMonth,
    formatMonthlyReport, firstDayOfMonth, isMonthlyUpdateComment, getIssues, formatProjectName, getMonday, LB,
    compareRepos, mapToTeamName, formatIssueTitleWithUrl, ContributorUpdates, formatCheckBox, epicLabels, formatEpicList
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

    // Only care about comments made in the last week
    const lastWeek = lastFiveDaysIso()

    // Get all repos
    const repos = await getRepos(octokit, org);

    // Get all issues updates in the last week
    const issues = []
    for (const repo of repos) {
        const _issues = await getIssues(octokit, org, repo.name, {state: "all", since: lastWeek, per_page: 100})
        issues.push(..._issues.map(i => {
            return {repoName: repo.name, ...i}
        }))
    }

    // Track contributor updates
    const contributorUpdates = new ContributorUpdates();

    // Map<repoName, {issue, text}[]>
    const weeklyUpdates = new Map()
    // Get all weekly update comments
    for (const issue of issues) {
        const comments = await getNewestCommentFirst(octokit, issue, issue.repoName, lastWeek);

        let _weeklyUpdatesText = []
        for (const comment of comments) {
            if (isWeeklyUpdateComment(comment)) {
                _weeklyUpdatesText.push(cleanUpdate(comment.body))
                contributorUpdates.update(comment)
            }
        }

        if (_weeklyUpdatesText.length !== 0) {
            const _updates = weeklyUpdates.get(issue.repoName) ?? []
            for (const text of _weeklyUpdatesText) {
                _updates.push({text, issue})
            }
            weeklyUpdates.set(issue.repoName, _updates)
        }
    }

    // Check who has done an update
    let contributorsCheck = ""
    for (const [contributor, comments] of contributorUpdates.updates) {
        contributorsCheck += formatCheckBox(comments.length) + contributor + LB
    }
    contributorsCheck += LB
    console.log(contributorsCheck)

    // Build the report
    let report = ""
    let projectName = formatProjectName(org);

    report += getMonday().toISOString().substring(0, 10) + " " + projectName + " weekly" + LB

    repos.sort(compareRepos)

    // Sort updates per repo
    for (const repo of repos) {
        const updates = weeklyUpdates.get(repo.name)
        if (!updates || !updates.length) {
            continue
        }
        report += "---" + LB
        report += "### " + mapToTeamName(repo.name) + LB + LB

        // Add milestones updates
        for (const {issue, text} of updates) {
            const labels = issue.labels.map(l => l.name).filter(n => !LABELS_TO_FILTER_OUT.includes(n))
            const fmtLabels = labels ? labels.map(l => " {" + l + "}") : ""
            report += "**" + formatIssueTitleWithUrl(issue) + "**" + fmtLabels + LB
            report += text + LB + LB
        }
    }
    report += "---" + LB

    console.log(report)
}

const LABELS_TO_FILTER_OUT = ["epic", "good first issue", "help wanted", "track:protocol-incentivization"]

async function month(m) {
    const octokit = getOctokit();

    const org = "waku-org"
    const milestoneRepo = "pm"

    const monthIndex = m - 1

    // Get all milestones
    const milestones = await getMilestones(octokit, org, milestoneRepo)

    const since = firstDayOfMonth(monthIndex)

    // For each milestone, get the monthly update
    for (const milestone of milestones) {
        // TODO: this really only work when getting most recent month
        const comments = await getNewestCommentFirst(octokit, milestone, milestoneRepo, since);

        for (const comment of comments) {

            if (isMonthlyUpdateComment(comment)) {
                milestone.monthlyUpdate = cleanUpdate(comment.body)
                break
            }
        }
    }

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

    const org = "waku-org"
    const pmRepo = "pm"

    // Only get open epics
    const epics = await getEpics(octokit, org, pmRepo)

    const issuesPerLabel = new Map();
    const epicsPerLabel = new Map();

    for (const epic of epics) {
        const labels = epicLabels(epic)
        // should be one label per epic

        if (labels.length > 1) throw new Error(`Too many labels on ${epic.html_url}`)
        if (labels.length) {
            issuesPerLabel.set(labels[0].name, [])
            epicsPerLabel.set(labels[0].name, epic)
        }
    }

    const allEpicLabels = Array.from(issuesPerLabel.keys());
    console.log(allEpicLabels.length + " labels")

    // Get all repositories
    const repos = await getRepos(octokit, org);
    console.log(repos.length + " repos")

    for (const repo of repos) {
        if (repo.name === pmRepo) continue
        // Seems like the best way is to spam the API to get all issues with label of open epics
        for (const label of allEpicLabels) {
            const issues = await getIssues(octokit, org, repo.name, {labels: label, state: "all"})
            const _issues = issuesPerLabel.get(label)
            _issues.push(...issues.map(i => {
                return {repoName: repo.name, ...i}
            }))
            issuesPerLabel.set(label, _issues)
        }
    }
    const text = formatEpicList(epicsPerLabel, issuesPerLabel);

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
