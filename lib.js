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

    const octokit = new Octokit({
        auth: TOKEN
    });
    return octokit;
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
    let clean = ""
    const a = update.split("\n")
    for (const l of a) {
        if (l.search(WAKU_UPDATE_RE) !== -1) {
            continue
        }
        if (l.search(/^ *\n$/) !== -1) {
            continue
        }
        clean += l.trim().replace(/\n/, "") + LB
    }
    return clean
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
    return "[" + milestone.title + "](" + milestone.html_url + ")";
}

function formatWeeklyReport(owner, repos, updates) {
    let text = ""
    let projectName = formatProjectName(owner);

    // Format updates
    for (const repo of repos) {
        if (!updates[repo.name] || !updates[repo.name].length) {
            continue
        }
        text += "---" + LB
        text += projectName + LB
        text += repo.name + LB
        text += "Highlight: **please fill highlight of past week**" + LB + LB

        // Add milestones updates
        for (const a of updates[repo.name]) {
            text += "**" + formatMilestoneTitleWithUrl(a.milestone) + "**" + LB
            text += a.update + LB
        }
    }
    return text + LB + "---" + LB
}

function formatMilestoneList(repoMilestones) {
    let text = ""

    repoMilestones.forEach((milestones, repoFullName) => {
        if (milestones.length > 0) {
            text += repoFullName + LB
            milestones.forEach((milestone) => {
                text += "  " + formatMilestoneTitleWithUrl(milestone) + LB
            })
        }
    })

    return text;
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
