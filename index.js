import Git from 'nodegit';

const clone = (url, dir) => {
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

const getMasterCommit = repo => {
	return repo.getMasterCommit();
}

const resetUAT = (repo, head) => {
	console.log("Resetting UAT to head of Master");
	return new Promise((resolve, reject) => {
		return repo.checkoutBranch('uat')
			.then(() => {
				Git.Reset.reset(repo, head, Git.Reset.TYPE.HARD)
				.then(resolve)
				.catch(reject)
			})
			.catch(reject);
	});
}

const checkoutBranch = (repo, branchName) => {
	return repo.checkoutBranch(branchName);
}

const getAllBranches = remote => {
	return new Promise((resolve, reject) => {
		remote.connect(Git.Enums.DIRECTION.FETCH, {
			certificateCheck: () => 1,
			credentials: function(url, userName){
				return Git.Cred.sshKeyFromAgent(userName);
			}
		}).then(status => {
				remote.referenceList()
					.then((refs) => {
						remote.disconnect()
							.then(resolve(refs))
							.catch(reject);
						})
					.catch(reject);
				})
			.catch(reject);
	});
}

const pushUAT = origin => {
	console.log("Time to push");
	return new Promise((resolve, reject) => {
		origin.push(["refs/heads/uat:refs/heads/uat"], { 
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

const createBranch = (repo, branchName, commit) => {
	console.log(`Creating ${branchName} and setting upstream to remote`);
	return new Promise((resolve, reject) => {
		repo.createBranch(branchName, commit)
			.then(ref => {
				Git.Branch.setUpstream(ref, `origin/${branchName}`)
					.then(resolve)
					.catch(reject);
			})
			.catch(reject);
	});
	return repo.createBranch(branchName, commit);
}

const mergeBranches = (repo, branches, destination, isFastForward = true) => {
	console.log(`Merging ${branches} into ${destination}`);
	const mergePreference = isFastForward ? Git.Merge.PREFERENCE.FASTFORWARD_ONLY : Git.Merge.PREFERENCE.NO_FASTFORWARD;
	return new Promise((resolve, reject) => {
		repo.mergeBranches(destination, branches, null, mergePreference)
			.then(oid => {
				console.log("Success");
				console.log(oid);
				resolve();
			})
			.catch(error => {
				console.log(error);
				reject(error);
			})
	});
}

async function resetAndMerge(){

	const repo = await clone('git@github.com:jhamet93/MinimalUATCodeDrift.git', './tmp');
	const origin = await repo.getRemote('origin');
	const masterCommit = await getMasterCommit(repo);
	const allRefs = await getAllBranches(origin);
	const nonMasterRefs = allRefs.filter(ref => ['HEAD', 'refs/heads/master'].indexOf(ref.name()) === -1);

	let promise = Promise.resolve();
	for (const ref of nonMasterRefs){
		const components = ref.name().split('/');
		const branchName = components[components.length - 1];
		promise = promise.then(() => createBranch(repo, branchName, masterCommit));
		promise = promise.then(() => mergeBranches(repo, `origin/${branchName}`, branchName));
	}

	promise = promise.then(() => resetUAT(repo, masterCommit))

	const featureRefs = nonMasterRefs.filter(ref => ['refs/heads/uat'].indexOf(ref.name()) === -1);
	for (const ref of featureRefs){
		const components = ref.name().split('/');	
		const branchName = components[components.length - 1];
		promise = promise.then(() => mergeBranches(repo, branchName, 'uat', false))
	}

	//promise.then(() => pushUAT(origin));

}

resetAndMerge();
