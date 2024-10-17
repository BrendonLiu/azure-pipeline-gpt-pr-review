import * as tl from "azure-pipelines-task-lib/task";
import { Agent } from 'https';
import fetch from 'node-fetch';

export async function addCommentToPR(fileName: string, lineNumber: number, comment: string, suggestion: string, httpsAgent: Agent) {

  const organizationUrl = tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI') as string; // 例如: https://dev.azure.com/your-organization/
  const organization = organizationUrl.split('/')[3];
  const project = tl.getVariable('SYSTEM.TEAMPROJECT') as string; // 取得專案名稱
  const repository = tl.getVariable('Build.Repository.Name'); // 從環境變數取得儲存庫名稱
  const pullRequestId = tl.getVariable('System.PullRequest.PullRequestId'); // 從環境變數取得 PR 編號
  const branchName = tl.getVariable('Build.SourceBranchName'); // 從環境變數取得分支名稱

  const fileUrl = `https://dev.azure.com/${organization}/${project}/_git/${repository}/pullRequest/${pullRequestId}?path=${encodeURIComponent(fileName)}&version=GB${branchName}&line=${lineNumber}`;
  
  const body = {
    comments: [
      {
        parentCommentId: 0,
        content: `${comment}\n\n[View code line](${fileUrl})\n\n\`\`\`suggestion\n${suggestion}\n\`\`\``,
        commentType: 1
      }
    ],
    status: 1,
    threadContext: {
      filePath: fileName,
      rightFileStart: {
        line: lineNumber,
        offset: 1
      },
      rightFileEnd: {
        line: lineNumber,
        offset: 1
      }
    }
  };

  const prUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads?api-version=5.1`;

  console.log(`prUrl is ${prUrl} .`);

  const response = await fetch(prUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    agent: httpsAgent
  });

  // 檢查回應狀態碼
  if (response.ok) { // 狀態碼在 200-299 之間表示成功
    const responseData = await response.json();
    console.log("Comment added successfully:", responseData);
  } else {
    console.error(`Failed to add comment. Status: ${response.status}, Message: ${await response.text()}`);
  }

  console.log(`New comment with suggestion added.`);
}
export async function deleteExistingComments(httpsAgent: Agent) {
  console.log("Start deleting existing comments added by the previous Job ...");

  const threadsUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads?api-version=5.1`;
  const threadsResponse = await fetch(threadsUrl, {
    headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` },
    agent: httpsAgent
  });

  const threads = await threadsResponse.json() as { value: [] };
  const threadsWithContext = threads.value.filter((thread: any) => thread.threadContext !== null);

  const collectionUri = tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI') as string;
  const collectionName = getCollectionName(collectionUri);
  const buildServiceName = `${tl.getVariable('SYSTEM.TEAMPROJECT')} Build Service (${collectionName})`;

  for (const thread of threadsWithContext as any[]) {
    const commentsUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads/${thread.id}/comments?api-version=5.1`;
    const commentsResponse = await fetch(commentsUrl, {
      headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` },
      agent: httpsAgent
    });

    const comments = await commentsResponse.json() as { value: [] };

    for (const comment of comments.value.filter((comment: any) => comment.author.displayName === buildServiceName) as any[]) {
      const removeCommentUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads/${thread.id}/comments/${comment.id}?api-version=5.1`;

      await fetch(removeCommentUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` },
        agent: httpsAgent
      });
    }
  }

  console.log("Existing comments deleted.");
}

function getCollectionName(collectionUri: string) {
  const collectionUriWithoutProtocol = collectionUri!.replace('https://', '').replace('http://', '');

  if (collectionUriWithoutProtocol.includes('.visualstudio.')) {
    return collectionUriWithoutProtocol.split('.visualstudio.')[0];
  }
  else {
    return collectionUriWithoutProtocol.split('/')[1];
  }
}