import * as tl from "azure-pipelines-task-lib/task";

export function getFileExtension(fileName: string) {
  return fileName.slice((fileName.lastIndexOf(".") - 1 >>> 0) + 2);
}

export function getTargetBranchName() {
  let targetBranchName = tl.getVariable('System.PullRequest.TargetBranchName');

  if (!targetBranchName) {
    targetBranchName = tl.getVariable('System.PullRequest.TargetBranch')?.replace('refs/heads/', '');
  }

  if (!targetBranchName) {
    return undefined;
  }

  return `origin/${targetBranchName}`;
}

export const defaultAIInstruction: string = `
Act as a code reviewer of a Pull Request, providing feedback on possible bugs and clean code issues.
You are provided with the Pull Request changes in a patch format.
Each patch entry has the commit message in the Subject line followed by the code changes (diffs) in a unidiff format.
As a code reviewer, your task is:
  - Review only added, edited, or deleted lines.
  - If there's no bugs and the changes are correct, write only 'No feedback.'
  - If there's a bug or incorrect code changes, don't write 'No feedback.'
`;