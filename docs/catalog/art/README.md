# Catalog artwork

These are the source drawings for the banner and gallery in
[`docs/catalog`](..). `scripts/catalog-art.mjs` crops them, dithers them into
blue and lays the plugin's synthetic-data screenshots over them.

All seven are AI-generated. They were made with the `openai-codex` image
provider bundled with Hermes Agent (gpt-image-2). No existing artwork was used
as input. [`generation.json`](generation.json) lists each prompt, model, size
and the image it feeds.

| File | Used in |
| --- | --- |
| `hero.png` | `banner.png` |
| `memory.png` | `gallery-memory.png` |
| `ask.png` | `gallery-ask.png` |
| `correct.png` | `gallery-correct.png` |
| `pane.png` | `gallery-pane.png` |
| `messages.png` | `gallery-messages.png` |
| `status.png` | `gallery-status.png` |

## The character

The five drawings of the girl were generated with the Nous Girl mark as a
reference image. That mark is `assets/nous-girl-black.svg` in
[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent),
published under the MIT license below. The drawings are new illustrations of
that character, not copies of the mark.

The Nous Girl is a brand asset of Nous Research. Using her here does not mean
Nous Research made, endorses or supports this plugin. It is an independent
community project, not affiliated with Nous Research or with Plastic Labs, the
makers of Honcho.

## Notice for the Nous Girl mark

```text
MIT License

Copyright (c) 2025 Nous Research

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
