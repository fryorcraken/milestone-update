# milestone-update

Extract and format weekly updates:
- Only issues with label `milestone` are considered
- Comment must contains `**Weekly Update**`
- Comment must be done within last week

```
git clone https://github.com/fryorcraken/milestone-update.git
cd milestone-update
npm i
export GH_TOKEN=<GitHub Token with `repo` or `repo_public` scope>
# Print weekly update
node ./index.js weekly
# List all miletones
node ./index.js list
# List milestones sorted by Epicc
node ./index.js epics
```
