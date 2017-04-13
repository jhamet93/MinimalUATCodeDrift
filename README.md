# MinimalUATCodeDrift

The goal of this script was to reduce the code drift between a production branch and a staging branch over time.

## Background
At one point, there was a neccessity for a branching strategy that allowed for feature branches but kept in line with our need to have a staging branch.
The strategy we developed was as follows:
  1. Master represents what code is on production. Create feature branches off of master
  2. When a feature is done, it needs to be tested in the staging environment before being production code. In order for your QA support to verify any changes, it needs to be released in a staging environment. Therefore, merge your feature branch into the staging branch
  3. When a feature is correct and ready to release, rebase the feature branch onto the master branch.
  4. If a feature needs to be modified or fails QA, make changes on feature branch and merge into the staging branch....again

This strategy allowed our QA support to easily test changes in a shared environment. In certain situations, some feature branches would never even make it to production so they would lounge around on the staging branch. In other situations, the developer might have to make multiple merges into the staging branch resulting in a clutter of merge commits.

## Implementation

This script reads a simple configuration that details the names of your production and staging branches as well as some other basic information. Everytime this script is executed, it resets the staging branch to the head of the master branch, and then merges in each feature branch resulting in a max of one merge commit per feature. If a feature never makes it to production, delete the branch and it will not be merged into staging on the next execution of the script. The aim is for this script to be executed everytime a push is made to the staging branch. This results in less code drift between the two branches and the easy elimination of dead features.
