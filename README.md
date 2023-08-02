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
node ./index.js
```
