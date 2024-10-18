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

    // 檢查回應並解析 JSON 格式的建議
    if (choices && choices.length > 0) {
      const message = choices[0].message;
      console.log("Raw message from GPT:", message); // 打印原始的 message 內容以便檢查格式

      const review = message?.content as string;
      console.log("Raw review from GPT:", review);
        
      try {
        const suggestions = JSON.parse(review); // 將回應直接解析為 JSON 陣列
    
        // 確認 JSON 格式為陣列，並逐條處理建議
        if (Array.isArray(suggestions)) {
          for (const suggestion of suggestions) {
            const lineNumber = suggestion.line;
            const content = suggestion.content;
    
            // 新增評論
            await addCommentToPR(fileName, lineNumber, content, httpsAgent);
          }
        } else {
          console.log("Unexpected format: Expected an array of suggestions.");
        }
      } catch (error) {
        console.error("Failed to parse JSON response:", error);
        console.log("Non-JSON response content:", review); // 如果解析失敗，打印回應內容以便進一步調試
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