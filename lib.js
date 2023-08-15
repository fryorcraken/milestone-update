// Foolproof regex
const {Octokit} = require("octokit");
const WEEKLY_UPDATE_RE = /\*\*weekly *update\*\*/i
const LB = "\n"
const NO_EPIC_LABEL = "NO EPIC LABEL"
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

async function getEpics(octokit, org, epicRepo) {
    const res = await octokit.request(`GET /repos/${org}/${epicRepo}/issues`, {
        owner: org,
        repo: epicRepo,
        labels: "epic",
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
    if (!res.data) throw new Error(`Failed to get issues for ${repo.full_name}: ${res}`)
    return res.data
}


async function getMilestones(octokit, org, repo, options) {
    const res = await octokit.request(`GET /repos/${repo.full_name}/issues`, {
        owner: org,
        repo: repo.name,
        labels: "milestone",
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        },
        ...options
    })
    if (!res.data) throw new Error(`Failed to get issues for ${repo.full_name}: ${res}`)
    return res.data
}

async function getRepos(octokit, owner) {
    const res = await octokit.request(`GET /orgs/${owner}/repos`, {
        org: 'owner',
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        },
        per_page: 50
    })
    if (!res.data) throw new Error(`Failed to get repos for ${owner}: ${res}`)
    return res.data
}

function isWeeklyUpdateComment(comment) {
    return comment.body.search(WEEKLY_UPDATE_RE) !== -1
}

function cleanUpdate(update) {
    return update.replace(WEEKLY_UPDATE_RE, "").replace(/^\s*[\r\n]$/gm, "")
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

function formatWeeklyReport(owner, repos, updates) {
    let text = ""
    let projectName = formatProjectName(owner);

    text += getMonday().toISOString().substring(0, 10) + " " + projectName + " weekly" + LB

    repos.sort(compareRepos)

    // Format updates
    for (const repo of repos) {
        if (!updates[repo.name] || !updates[repo.name].length) {
            continue
        }
        text += "---" + LB
        text += mapToTeamName(repo.name) + LB + LB

        // Add milestones updates
        for (const {milestone, update} of updates[repo.name]) {
            const epic = getEpicLabel(milestone)
            const epicLabel = epic ? " {" + epic + "}" : ""
            text += "**" + formatIssueTitleWithUrl(milestone) + "**" + epicLabel + LB
            text += update + LB + LB
        }
    }
    return text + "---" + LB
}

function formatMilestoneList(repoMilestones) {
    let text = ""

    repoMilestones.forEach((milestones, repoFullName) => {
        if (milestones.length > 0) {
            text += repoFullName + LB
            milestones.forEach((milestone) => {
                const epic = getEpicLabel(milestone)
                const epicLabel = epic ? " {" + epic + "}" : ""
                text += "  " + formatIssueTitleWithUrl(milestone) + epicLabel + LB
            })
        }
    })

    return text;
}

function formatCheckBox(issue) {
    if (issue.state === 'open') {
        return "- [ ] "
    } else {
        return "- [x] "
    }
}

function formatMilestoneByEpicList(epics, epicMilestones) {
    let text = ""

    epics.forEach((epic) => {
        const label = getEpicLabel(epic) ?? NO_EPIC_LABEL;

        text += "# " + formatIssueTitleWithUrl(epic) + " `" + label + "`" + LB

        const milestones = epicMilestones.get(label) ?? []
        for (const milestone of milestones) {
            text += "  " + formatCheckBox(milestone) + milestone.repo_name + ": " + formatIssueTitleWithUrl(milestone) + LB
        }
        text += LB
    })


    const milestones = epicMilestones.get(NO_EPIC_LABEL).filter(m => m.state === "open")
    if (milestones) {
        text += "# Orphan Milestones" + LB
        for (const milestone of milestones) {
            text += formatCheckBox(milestone) + milestone.repo_name + ": " + formatIssueTitleWithUrl(milestone) + LB
        }
        text += LB
    }

    return text;
}

const REPOS_IN_ORDER = ["pm", "internal-waku-outreach", "docs.waku.org", "research", "nwaku", "js-waku", "go-waku"]

function compareRepos(repoA, repoB) {
    return REPOS_IN_ORDER.indexOf(repoA.name) - REPOS_IN_ORDER.indexOf(repoB.name);
}

function getEpicLabel(milestone) {
    for (const {name} of milestone.labels) {
        if (name.startsWith("E:")) {
            return name;
        }
    }
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

module.exports = {
    getRepos,
    getMilestones,
    lastWeekIso: lastFiveDaysIso,
    getNewestCommentFirst,
    isWeeklyUpdateComment,
    cleanUpdate,
    formatWeeklyReport,
    getEpics,
    getEpicLabel,
    getOctokit,
    formatMilestoneList,
    formatMilestoneByEpicList
}
