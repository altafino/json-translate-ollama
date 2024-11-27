export async function translate(
    text: string,
    targetLang: string,
    signal?: AbortSignal,
    onProgress?: (progress: number) => void,
    onStream?: (chunk: string) => void
) {
  try {
    const prompt = `Please translate the following JSON content to ${targetLang}, keep the JSON structure unchanged, only translate the value part.
Note:
1. Keep all keys unchanged
2. Only translate value parts
3. Keep JSON format valid
4. Keep all special characters and formats

JSON content:
${text}`;
    console.log('prompt:', prompt);
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3.2', // Adjust the model name as needed
        prompt: prompt,
        system:
            'You are a professional JSON translation assistant. Please return the translated JSON content directly, without adding any markdown tags or other formats.',
      }),
      signal: signal,
    });
    console.log('response:', response);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
      throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
    } else if (signal?.aborted) {
        console.error('Translation request was aborted');
        throw new Error('Translation request was aborted');
    } else {
        console.log('Translation request was not aborted');
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder('utf-8');

    let fullContent = '';
    let tokenCount = 0;
    const estimatedTokens = text.length / 4; // Estimate total token count

    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let lines = buffer.split('\n');

      // Process all lines except the last one (could be incomplete)
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const json = JSON.parse(line);
            if (json.response) {
              fullContent += json.response;
              tokenCount += json.response.length / 4;

              // Calculate progress
              const progress = Math.min(Math.round((tokenCount / estimatedTokens) * 100), 100);
              onProgress?.(progress);

              onStream?.(fullContent);
            }

            if (json.done) {
              reader.cancel();
              break;
            }
          } catch (e) {
            console.error('Error parsing JSON:', e);
          }
        }
      }

      // Keep the last line (could be incomplete)
      buffer = lines[lines.length - 1];
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const json = JSON.parse(buffer);
        if (json.response) {
          fullContent += json.response;
          tokenCount += json.response.length / 4;

          // Calculate progress
          const progress = Math.min(Math.round((tokenCount / estimatedTokens) * 100), 100);
          onProgress?.(progress);

          onStream?.(fullContent);
        }
      } catch (e) {
        console.error('Error parsing JSON:', e);
      }
    }

    // Validate final JSON format
    try {
      const parsedJson = JSON.parse(fullContent);
      fullContent = JSON.stringify(parsedJson, null, 2);
    } catch (e) {
      if (signal?.aborted) {
        return '';
      }
      throw new Error(`Invalid translation result format: ${(e as Error).message}`);
    }

    return fullContent;
  } catch (error: unknown) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return '';
    }
    throw error;
  }
}

export async function validateApiKey(): Promise<boolean> {
  // Since the Ollama API doesn't use API keys, this function checks if the API is accessible.
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3.2', // Adjust the model name as needed
        prompt: 'test',
      }),
    });
    console.log(response)
    if (response.ok) {
      return true;
    } else {
      throw new Error(`Ollama API returned status ${response.status}`);
    }
  } catch (error) {
    throw new Error(`Cannot connect to Ollama API: ${(error as Error).message}`);
  }
}
