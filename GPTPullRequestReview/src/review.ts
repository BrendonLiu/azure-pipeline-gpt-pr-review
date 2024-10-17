import fetch from 'node-fetch';
import { git } from './git';
import { OpenAIApi } from 'openai';
import { addCommentToPR } from './pr';
import { Agent } from 'https';
import * as tl from "azure-pipelines-task-lib/task";

export async function reviewFile(targetBranch: string, fileName: string, httpsAgent: Agent, apiKey: string, openai: OpenAIApi | undefined, aoiEndpoint: string | undefined) {
  console.log(`Start reviewing ${fileName} ...`);

  const defaultOpenAIModel = 'gpt-4o-mini';
  const patch = await git.diff([targetBranch, '--', fileName]);

  const instructions = tl.getInput('ai_instructions');

  function getLineNumberFromPatch(patch: string): number {
    const match = patch.match(/\+(\d+),?\d* @@/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return 1; // 預設行號
  }

  function extractSuggestionFromReview(review: string): string {
    const match = review.match(/`([^`]+)`/);
    if (match) {
      return match[1];
    }
    return "console.log('Suggested change');";
  }

  try {
    let choices: any;

    if (openai) {
      const response = await openai.createChatCompletion({
        model: tl.getInput('model') || defaultOpenAIModel,
        messages: [
          {
            role: "system",
            content: instructions
          },
          {
            role: "user",
            content: patch
          }
        ],
        max_tokens: 500
      });

      choices = response.data.choices;
    }
    else if (aoiEndpoint) {
      const request = await fetch(aoiEndpoint, {
        method: 'POST',
        headers: { 'api-key': `${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `${instructions}\n, patch : ${patch}`
          }]
        })
      });

      const response = await request.json();

      choices = response.choices;
    }

    if (choices && choices.length > 0) {
      const review = choices[0].message?.content as string;

      if (review.trim() !== "No feedback.") {
        const lineNumber = getLineNumberFromPatch(patch); // 自動取得行號
        const suggestion = extractSuggestionFromReview(review); // 提取建議的程式碼

        await addCommentToPR(fileName, lineNumber, review, suggestion, httpsAgent);
      }
    }

    console.log(`Review of ${fileName} completed.`);
  }
  catch (error: any) {
    if (error.response) {
      console.log(error.response.status);
      console.log(error.response.data);
    } else {
      console.log(error.message);
    }
  }
}