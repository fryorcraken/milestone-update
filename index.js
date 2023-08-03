const {Octokit} = require("octokit");

// Foolproof regex
const WAKU_UPDATE_RE = /\*\*weekly *update\*\*/i
const LB = "\n"

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
        clean += l.trim().replace(/\n/,"") + LB
    }
    return clean
}

function formatProjectName(org) {
    let projectName = org;
    projectName = projectName.replace(/-.*/, "")
    return projectName[0].toUpperCase() + projectName.substring(1)
}

async function getLastWeekCommentsNewestFirst(octokit, milestone, repo, lastWeek) {
    const res = await octokit.request(milestone.comments_url, {
        owner: milestone.owner,
        repo: repo.name,
        issue_number: milestone.number,
        since: lastWeek,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
    if (!res.data) throw new Error(`Failed to get comments for ${milestone.html_url}: ${res}`)
    return res.data.reverse()
}

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
            const comments = await getLastWeekCommentsNewestFirst(octokit, milestone, repo, lastWeek);

            let weeklyUpdate
            for (const comment of comments) {
                if (comment.body.search(WAKU_UPDATE_RE) !== -1) {
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

    let text = ""
    let projectName = formatProjectName(ORG);

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
            text += "**[" + a.milestone.title + "](" + a.milestone.html_url + ")**" + LB
            text += a.update + LB
        }
    }
    text += LB + "---" + LB

    console.log("UPDATE:\n" + text)
}

function lastWeekIso() {
    const lastWeek = new Date()
    const lastWeekInt = (lastWeek).getDate() - 7;
    lastWeek.setDate(lastWeekInt);

    return lastWeek.toISOString()
}
main().then(() => console.log("done."));
