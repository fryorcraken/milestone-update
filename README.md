# milestone-update

```
git clone https://github.com/fryorcraken/milestone-update.git
cd milestone-update
npm i
export GH_TOKEN=<GitHub Token with `repo` or `repo_public` scope>
# Print weekly update
node ./index.js weekly
# List all epics (pm repo) and related issues in all repos (using labels)
node ./index.js epics
```
