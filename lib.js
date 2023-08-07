// Foolproof regex
const {Octokit} = require("octokit");
const WAKU_UPDATE_RE = /\*\*weekly *update\*\*/i
const LB = "\n"

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

async function getMilestones(octokit, org, repo) {
    const res = await octokit.request(`GET /repos/${repo.full_name}/issues`, {
        owner: org,
        repo: repo.name,
        labels: "milestone",
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
    if (!res.data) throw new Error(`Failed to get issues for ${repo.full_name}: ${res}`)
    return res.data
}

async function getRepos(octokit, owner) {
    const res = await octokit.request(`GET /orgs/${owner}/repos`, {
        org: 'owner',
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
    if (!res.data) throw new Error(`Failed to get repos for ${owner}: ${res}`)
    return res.data
}

function isWeeklyUpdateComment(comment) {
    return comment.body.search(WAKU_UPDATE_RE) !== -1
}

function cleanUpdate(update) {
    return update.replace(WAKU_UPDATE_RE, "").replace(/^\s*[\r\n]$/gm, "")
}

function formatProjectName(org) {
    let projectName = org;
    projectName = projectName.replace(/-.*/, "")
    return projectName[0].toUpperCase() + projectName.substring(1)
}

function lastWeekIso() {
    const lastWeek = new Date()
    const lastWeekInt = (lastWeek).getDate() - 7;
    lastWeek.setDate(lastWeekInt);

    return lastWeek.toISOString()
}

async function getNewestCommentFirst(octokit, milestone, repo, since) {
    const res = await octokit.request(milestone.comments_url, {
        owner: milestone.owner,
        repo: repo.name,
        issue_number: milestone.number,
        since: since,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
    if (!res.data) throw new Error(`Failed to get comments for ${milestone.html_url}: ${res}`)
    return res.data.reverse()
}

function formatMilestoneTitleWithUrl(milestone) {
    const title = milestone.title.replace(/\[?milestone]?:? +/i, "")
    return "[" + title + "](" + milestone.html_url + ")";
}

function getMonday( ) {
    let date = new Date();
    const day = date.getDay() || 7;
    if( day !== 1 )
        date.setHours(-24 * (day - 1));
    return date;
}

function formatWeeklyReport(owner, repos, updates) {
    let text = ""
    let projectName = formatProjectName(owner);

    text += getMonday().toISOString().substring(0, 10) + " " + projectName + " weekly" + LB

    // Format updates
    for (const repo of repos) {
        if (!updates[repo.name] || !updates[repo.name].length) {
            continue
        }
        text += "---" + LB
        text += repo.name + LB + LB

        // Add milestones updates
        for (const {milestone, update} of updates[repo.name]) {
            text += "**" + formatMilestoneTitleWithUrl(milestone) + "**" + " {" + getEpicLabel(milestone) + "}" + LB
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
                text += "  " + formatMilestoneTitleWithUrl(milestone) + " {" + getEpicLabel(milestone) + "}" + LB
            })
        }
    })

    return text;
}

function getEpicLabel(milestone) {
    let epicLabel = "NO EPIC"
    for (const {name} of milestone.labels) {
        if (name.startsWith("E:")) {
            epicLabel = name;
            break
        }
    }
    return epicLabel;
}

module.exports = {
    getRepos,
    getMilestones,
    lastWeekIso,
    getNewestCommentFirst,
    isWeeklyUpdateComment,
    cleanUpdate,
    formatWeeklyReport,
    getOctokit,
    formatMilestoneList
}
