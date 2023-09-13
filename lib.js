// Foolproof regex
const {Octokit} = require("octokit");
const WEEKLY_UPDATE_RE = /^\*?\*?weekly *update\*?\*?:?/i
const MONTHLY_UPDATE_RE = /^\*?\*?monthly *update\*?\*?/i
const LB = "\n"
const NO_MILESTONE_LABEL = "NO EPIC LABEL"
function getOctokit() {
    const TOKEN = process.env.GH_TOKEN

    if (!TOKEN) {
        throw new Error("GitHub Token needed to access repo comments." +
            " Use `repo` scope for public and private repositories," +
            "`public_repo` for only public repositories")
    }

    return new Octokit({
        auth: TOKEN
    });
}

getEpics = (octokit, org, repoName, options) => getIssues(octokit, org, repoName, {labels: "epic", ...options})
getMilestones = (octokit, org, repoName, options) => getIssues(octokit, org, repoName, {labels: "milestone", ...options})

async function getIssues(octokit, org, repoName, options) {
    const res = await octokit.request(`GET /repos/${org}/${repoName}/issues`, {
        owner: org,
        repo: repoName,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        },
        ...options
    })
    if (!res.data) throw new Error(`Failed to get issues for ${repoName}, ${JSON.stringify(options)}: ${res}`)
    return res.data.filter(i => !i.pull_request)
}

async function getIssuesForMonth(octokit, org, repoName, monthIndex, options) {
    // TODO: not future proof
    const since = new Date(2023, monthIndex, 1, 0, 0, 0, 0).toISOString();
    let lastDay = new Date(2023, monthIndex + 1, 1, 0, 0, 0, 0);
    lastDay = new Date(lastDay.valueOf() - 1)

    let page = 1
    const issues = []
    let cont = true
    while (cont) {
        let _issues = await getIssues(octokit, org, repoName, {
            page,
            since,
            sort: "updated",
            direction: "asc", ...options
        })

        if (!_issues.length) break;

        for (const issue of _issues) {
            const updatedAt = new Date(issue.updated_at)

            if (updatedAt.getTime() < lastDay.getTime()) {
                issues.push(issue)
            } else {
                cont = false
            }
        }
        page += 1
    }

    return issues
}

function wasUpdatedInMonth(monthIndex, issue) {
    const firstDay = firstDayOfMonth(monthIndex);
    let lastDay = new Date(2023, monthIndex + 1, 1, 0, 0, 0, 0);
    lastDay = new Date(lastDay.valueOf() - 1)

    // TODO: maybe best to rely on weekly updates (issues comments)
    const updatedAt = (new Date(issue.updated_at)).getTime()

    return updatedAt > firstDay.getTime() &&
        updatedAt < lastDay.getTime()
}

async function getRepos(octokit, owner) {
    const res = await octokit.request(`GET /orgs/${owner}/repos`, {
        org: 'owner',
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        },
        type: "public"
    })
    if (!res.data) throw new Error(`Failed to get repos for ${owner}: ${res}`)
    return res.data.filter (r => !r.archived)
}

function isWeeklyUpdateComment(comment) {
    return comment.body.search(WEEKLY_UPDATE_RE) !== -1
}

function isMonthlyUpdateComment(comment) {
    return comment.body.search(MONTHLY_UPDATE_RE) !== -1
}

function cleanUpdate(update) {
    return update.replace(WEEKLY_UPDATE_RE, "")
        .replace(MONTHLY_UPDATE_RE, "")
        .replace(/^\s*[\r\n]$/gm, "")
}

function formatProjectName(org) {
    let projectName = org;
    projectName = projectName.replace(/-.*/, "")
    return projectName[0].toUpperCase() + projectName.substring(1)
}

function lastFiveDaysIso() {
    const lastWeek = new Date()
    const lastWeekInt = (lastWeek).getDate() - 5;
    lastWeek.setDate(lastWeekInt);

    return lastWeek.toISOString()
}

function firstDayOfMonth(monthIndex) {
    return new Date(2023, monthIndex, 1, 0, 0, 0, 0)
}

async function getNewestCommentFirst(octokit, milestone, repoName, since) {
    const res = await octokit.request(milestone.comments_url, {
        owner: milestone.owner,
        repo: repoName,
        issue_number: milestone.number,
        since: since,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
    if (!res.data) throw new Error(`Failed to get comments for ${milestone.html_url}: ${res}`)
    return res.data.reverse()
}

function formatIssueTitleWithUrl(issue) {
    const title = issue.title.replace(/\[?milestone]?:? +/i, "").replace(/\[?epic]?:? +/i, "")
    return "[" + title + "](" + issue.html_url + ")";
}

function getMonday( ) {
    let date = new Date();
    const day = date.getUTCDay() || 7;
    if( day !== 1 )
        date.setUTCHours(-24 * (day - 1));
    return date;
}

function formatEpicList(epicsPerLabel, issuesPerLabel) {
    let text = ""

    for (const [label, epic] of epicsPerLabel) {
        text += "# " + formatIssueTitleWithUrl(epic) + " {" + label + "}" + LB + LB

        const issues = issuesPerLabel.get(label)
        for (const issue of issues) {
            text += formatCheckBoxIssue(issue) + formatIssueTitleWithUrl(issue) + LB
        }

        text += LB
    }
    return text;
}

function formatCheckBoxIssue(issue) {
    return formatCheckBox(issue.state === 'open')
}

function formatCheckBox(pred) {
    if (pred) {
        return "- [x] "
    } else {
        return "- [ ] "
    }
}

function formatMonthlyReport(milestones, milestoneEpics) {
    let text = ""

    milestones.forEach((milestone) => {
        const label = getEpicLabel(milestone);
        if (!label) throw new Error(`No label for ${milestone.html_url}`)

        text += "# " + formatIssueTitleWithUrl(milestone) + " `" + label + "`" + LB + LB

        const {closed, open, updated} = milestoneEpics.get(label) ?? {closed: [], open: [], updated: []}

        text += `**Epics: ${closed.length} closed, ${open.length} open**` + LB + LB

        text += milestone.monthlyUpdate + LB + LB

        text += `## ${updated.length} Epic${updated.length ? "s" : ""} Updated` + LB
        for (const epic of updated) {
            text += "  " + formatCheckBoxIssue(epic) + epic.repo_name + ": " + formatIssueTitleWithUrl(epic) + LB
        }
        text += LB

    })

    return text;
}

function formatMilestoneByEpicList(milestones, milestoneEpics) {
    let text = ""

    milestones.forEach((milestone) => {
        const label = getEpicLabel(milestone) ?? NO_MILESTONE_LABEL;

        text += "# " + formatIssueTitleWithUrl(milestone) + " `" + label + "`" + LB

        const epics = milestoneEpics.get(label) ?? []
        for (const epic of epics) {
            text += "  " + formatCheckBoxIssue(epic) + epic.repo_name + ": " + formatIssueTitleWithUrl(epic) + LB
        }
        text += LB
    })


    const epics = milestoneEpics.get(NO_MILESTONE_LABEL)?.filter(m => m.state === "open")
    if (epics) {
        text += "# Orphan Milestones" + LB
        for (const epic of epics) {
            text += formatCheckBoxIssue(epic) + epic.repo_name + ": " + formatIssueTitleWithUrl(epic) + LB
        }
        text += LB
    }

    return text;
}

const REPOS_IN_ORDER = ["pm", "internal-waku-outreach", "docs.waku.org", "research", "nwaku", "js-waku", "go-waku"]

function compareRepos(repoA, repoB) {
    return REPOS_IN_ORDER.indexOf(repoA.name) - REPOS_IN_ORDER.indexOf(repoB.name);
}

function epicLabels(issue) {
    return issue.labels.filter(({name}) => name.startsWith("E:"))
}

const REPO_TEAM_MAP = new Map([
    ["docs.waku.org", "Docs"],
    ["internal-waku-outreach", "Eco Dev"],
    ["research", "Research"],
    ["pm", "Epics"]
])

function mapToTeamName(repo) {
    const teamName = REPO_TEAM_MAP.get(repo);
    return teamName ?? repo
}

const CONTRIBUTORS = [
    "LordGhostX",
    "danisharora099",
    "jm-clius",
    "Ivansete-status",
    "harsh-98",
    "weboko",
    "richard-ramos",
    "gabrielmer",
    "NagyZoltanPeter",
    "vpavlin",
    "chaitanyaprem",
    "fryorcraken",
    "hackyguru",
    "SionoiS",
    "s-tikhomirov",
    "alrevuelta"
]

class ContributorUpdates {
    updates;

    constructor() {
        this.updates = new Map()
        for (const c of CONTRIBUTORS.sort()) {
            this.updates.set(c, [])
        }
    }

    update(comment) {
        const contributor = comment?.user?.login
        if (contributor) {
            const comments = this.updates.get(contributor) ?? []
            const url = comment.html_url
            if (!url) {
                console.log(comment)
            }
            comments.push(url)
            this.updates.set(contributor, comments)
        }
    }

}

module.exports = {
    getRepos,
    getMilestones,
    lastFiveDaysIso,
    getNewestCommentFirst,
    isWeeklyUpdateComment,
    cleanUpdate,
    formatProjectName,
    getMonday,
    LB,
    mapToTeamName,
    compareRepos,
    formatMonthlyReport,
    getEpics,
    getIssues,
    epicLabels,
    ContributorUpdates,
    formatCheckBox,
    getOctokit,
    formatEpicList,
    formatIssueTitleWithUrl,
    formatMilestoneByEpicList,
    firstDayOfMonth,
    isMonthlyUpdateComment,
    wasUpdatedInMonth
}
