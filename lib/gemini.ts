import { GoogleGenAI } from '@google/genai';

export function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 3, httpStatusCodes: [408, 429, 500, 502, 503, 504] } },
  });
}
