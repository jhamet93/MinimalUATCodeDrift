import Git from 'nodegit';
import config from '../config.json';
import fs from 'fs';

/**
 * Looks in the directory to check if repository exists. If not, clones it into the directory
 * @param  {string} url
 * @param  {string} dir
 * @return {Repository}
 */
const retrieveRepo = (url, dir) => {

	if (fs.existsSync(dir)){
		return Git.Repository.open(dir);
	}

	console.log(`Cloning ${url} into ${dir}`);
	return Git.Clone(url, dir, {
		fetchOpts: {
			callbacks:{
				certificateCheck: () => 1,
				credentials: function(url, userName){
					return Git.Cred.sshKeyFromAgent(userName);
				}
			}
		}
	});
}

/**
 * Sets the HEAD of the branch to a commit
 * @param  {Repository} repo
 * @param  {Commit} head
 * @return {Promise}
 */
const resetStageToCommit = (repo, branch, head) => {
	console.log(`Resetting ${branch} to ${head.id()}`);
	return new Promise((resolve, reject) => {
		repo.checkoutBranch(branch).then(() => Git.Reset.reset(repo, head, Git.Reset.TYPE.HARD))
			.then(resolve)
			.catch(reject);
	});
}

/**
 * Gets all the branches on a remote
 * @param  {Remote} remote
 * @return {Promise}
 */
const getAllBranches = (remote, blacklist) => {
	console.log(`Get all branches on ${remote.name()} except ${blacklist}`);
	return new Promise((resolve, reject) => {
		remote.connect(Git.Enums.DIRECTION.FETCH, {
			certificateCheck: () => 1,
			credentials: (url, userName) => Git.Cred.sshKeyFromAgent(userName)
		}).then(status => remote.referenceList())
			.then(refs => {
				resolve(refs.filter(ref => blacklist.indexOf(getBranchName(ref)) === -1));	
			})
			.catch(reject);
	});
}

/**
 * Pushes a branch to the remote
 * @param  {Remote} origin
 * @return {Promise}
 */
const pushBranch = (origin, branch) => {
	console.log(`Pushing changes to ${origin}/${branch}`);
	return new Promise((resolve, reject) => {
		origin.push([`+refs/heads/${branch}:refs/heads/${branch}`], { 
				callbacks: {
					certificateCheck: () => 1,
					credentials: function(url, userName){  
				 		return Git.Cred.sshKeyFromAgent(userName)
				 	} 
				}
			})
			.then(resolve)
			.catch(reject);
	});
}

/**
 * Creates a branch locally with same name as remote branch, resets local branch to HEAD of the remote branch, and tracks remote branch
 * @param  {Repository} repo       
 * @param  {Array[RemoteHead]} remoteHeads
 * @return {Promise}
 */
const fetchRemoteBranches = (repo, remoteHeads) => {
	return new Promise((resolve, reject) => {
		let promise = Promise.resolve();
		for (const head of remoteHeads){
			promise = promise.then(() => repo.createBranch(getBranchName(head), head.oid()))
				.then(ref => Git.Branch.setUpstream(ref, `origin/${getBranchName(head)}`));
		}
		promise.then(resolve).catch(reject);
	});
};

/**
 * Creates a branch and sets its tracking branch as the same name on the remote
 * @param  {Repository} repo     
 * @param  {Array} branches 
 * @param  {Commit} commit   
 * @return {Promise}
 */
const createBranches = (repo, branches, commit) => {
	return new Promise((resolve, reject) => {
		let promise = Promise.resolve();
		for (const branch of branches){
			console.log(`Creating ${branch}`);
			promise = promise.then(() => repo.createBranch(branch, commit))
				.then(ref => Git.Branch.setUpstream(ref, `origin/${branch}`));
		}
		promise.then(resolve).catch(reject);
	});
}

/**
 * Merges branches based ona merge preference
 * @param  {Repository} repo            
 * @param  {Array} branches        
 * @param  {Array} destination     
 * @param  {Git.Merge.PREFERENCE} mergePreference
 * @return {Promise}                 
 */
const mergeBranches = (repo, branches, destination, mergePreference = Git.Merge.PREFERENCE.FASTFORWARD_ONLY) => {
	return new Promise((resolve, reject) => {
		let promise = Promise.resolve();
		let index = 0;
		for (const branch of branches){
			console.log(`Merging ${destination[index]} into ${branch}`);
			((to, from) => {
				promise = promise.then(() => repo.mergeBranches(to, from, null, mergePreference));
			})(branch, destination[index])
			index += 1;
		}

		promise.then(resolve('success')).catch(reject);
	});
}

/**
 * Parses the branch name of a refspec
 * @param  {RemoteHead} ref 
 * @return {string}
 */
const getBranchName = ref => {
	const components = ref.name().split('/');
	return components[components.length - 1];
}

async function resetAndMerge(){
	const repo = await retrieveRepo(config.ssh, config.path);
	const remote = await repo.getRemote(config.remote);
	const masterCommit = await repo.getMasterCommit();

	const allRefs = await getAllBranches(remote, config.blacklist);
	const nonMasterRefs = allRefs.filter(ref => ['HEAD', `refs/heads/${config.main}`].indexOf(ref.name()) === -1);
	const remoteBranches = await fetchRemoteBranches(repo, nonMasterRefs);
	const reset = await resetStageToCommit(repo, config.staging, masterCommit);

	const featureRefs = allRefs.filter(ref => ['HEAD', `refs/heads/${config.main}`, `refs/heads/${config.staging}`].indexOf(ref.name()) === -1).map(ref => getBranchName(ref)); 
	const mergeFeatures = await mergeBranches(repo, new Array(featureRefs.length).fill(config.staging), featureRefs, Git.Merge.PREFERENCE.NO_FASTFORWARD);
	const push = await pushBranch(remote, config.staging);
}

resetAndMerge().then(() => {
	console.log("Success!")
}).catch(error => {
	console.log(`Error: ${error}`);
});
