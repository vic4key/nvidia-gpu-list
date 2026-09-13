##  NVIDIA GPU List (Automated Daily Updates from Official Website)
[![NVIDIA GPU List](https://github.com/vic4key/nvidia-gpu-list/actions/workflows/main.yml/badge.svg?branch=master)](https://github.com/vic4key/nvidia-gpu-list/actions/workflows/main.yml)

### Install

```bash
$ nvm install 18
$ nvm use 18

$ git clone https://github.com/vic4key/nvidia-gpu-list.git
$ cd nvidia-gpu-list

$ npm i

# optional: timestamp written to the generated JSON files (used by CI)
$ export _DATE_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
$ node index.js
```

### Data sources

| File | Source |
| --- | --- |
| `data/nvidia.com_cuda-gpus.json` | https://developer.nvidia.com/cuda/gpus |
| `data/nvidia.com_cuda-legacy-gpus.json` | https://developer.nvidia.com/cuda/gpus/legacy |

Both URLs are the current targets of the old `cuda-gpus` / `cuda-legacy-gpus` pages (`301` redirects).

The pages publish a single table (`Compute Capability | Data Center | Workstation/Consumer | Jetson`)
where each cell lists GPU names separated by `<br>`. Some long names are additionally wrapped with
`<br>` too — those wraps are written with a single non-breaking space before the `<br>`, see
`extract_cell_items()` in `index.js`.

`date_time` comes from the `_DATE_TIME` environment variable, and a file is only rewritten when the
parsed GPU list actually changed, so a daily run does not create a commit when nothing changed.