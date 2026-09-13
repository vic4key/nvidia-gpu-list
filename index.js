const fs = require("fs");
const path = require("path");
const https = require("https");
const cheerio = require("cheerio");

/**
 * NVIDIA has moved + rebuilt the CUDA GPU pages:
 *   - https://developer.nvidia.com/cuda-gpus         -> 301 -> https://developer.nvidia.com/cuda/gpus
 *   - https://developer.nvidia.com/cuda-legacy-gpus  -> 301 -> https://developer.nvidia.com/cuda/gpus/legacy
 *
 * The old markup (.panel-group > .panel > h2/h3 + tbody > tr) is gone.
 * The new markup is a single table:
 *
 *   | Compute Capability | Data Center | Workstation/Consumer | Jetson |
 *
 * where every GPU-name list lives in a <td> whose entries are separated by <br>.
 */
const PAGES = [
  {
    url: "https://developer.nvidia.com/cuda/gpus",
    file: "nvidia.com_cuda-gpus.json",
  },
  {
    url: "https://developer.nvidia.com/cuda/gpus/legacy",
    file: "nvidia.com_cuda-legacy-gpus.json",
  },
];

const REQUEST_OPTIONS = {
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; nvidia-gpu-list/1.0)",
    Accept: "text/html,application/xhtml+xml",
  },
};

function save_file_sync(file_name, content, logging = true) {
  try {
    fs.writeFileSync(file_name, content, "utf8");
  }
  catch (e) {
    if (logging) console.error(`Failed to save file ${file_name}.`, e);
    return false;
  }

  return true;
}

/**
 * GET a url. The URLs above are the final ones (they used to be 301-redirected),
 * so a redirect here just means NVIDIA moved the page again -> report it loudly.
 */
function get_url_content(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, REQUEST_OPTIONS, (res) => {
      const status_code = res.statusCode || 0;

      if (status_code !== 200) {
        res.resume();
        const location = res.headers.location ? ` New location: ${res.headers.location}` : "";
        reject(new Error(`Unexpected status code ${status_code} while requesting ${url}.${location}`));
        return;
      }

      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve(data);
      });
      res.on("error", reject);
    });

    request.on("error", (error) => {
      reject(error);
    });

    request.setTimeout(30000, () => {
      request.destroy(new Error(`Request timed out: ${url}`));
    });
  });
}

function clean_text(text) {
  return (text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read a <td> and return its entries.
 *
 * Entries are separated by <br>, but the page also uses <br> to wrap ONE long
 * GPU name onto two lines, e.g. "NVIDIA RTX PRO 6000" + <br> + "Blackwell
 * Server Edition" is a single GPU. The wrap flavour is always written with
 * exactly one non-breaking space before the <br>, while the real separators
 * have no such single NBSP (they use none, or two NBSPs).
 */
function extract_cell_items($, cell) {
  const html = ($(cell).html() || "")
    .replace(/&nbsp;/gi, "\u00a0") // cheerio re-encodes NBSP as an entity
    .replace(/(?<!\u00a0)\u00a0<br\s*\/?>/gi, " ") // soft wrap inside a name
    .replace(/<br\s*\/?>/gi, "\n"); // real separator
  const text = $("<span></span>").html(html).text();

  return text.split("\n").map(clean_text).filter(Boolean);
}

/**
 * Parse the "Compute Capability" table and return one entry per column:
 *   [
 *     {
 *       name: "Data Center",
 *       list: [
 *         { name: "12.0", list: [ { name: "NVIDIA ...", compute_capability: "12.0" }, ... ] },
 *       ],
 *     },
 *     ...
 *   ]
 * The shape stays compatible with the table renderer used by index.html.
 */
function extract_gpu_list_from_html_content(html_content) {
  const $ = cheerio.load(html_content);
  let nvidia_gpu_list = null;

  $("table").each(function (_, _table) {
    if (nvidia_gpu_list) return false; // already found

    const table = $(_table);
    const th_cells = table.find("thead").first().find("th").toArray();
    const rows = table.find("tbody").first().children("tr").toArray();

    if (!th_cells.length || !rows.length) return;

    const headers = th_cells.map((th) => clean_text($(th).text()));
    if (!/^compute capability/i.test(headers[0] || "")) return;

    // One category per column after the "Compute Capability" column.
    const categories = headers.slice(1).map((header, index) => ({
      name: header || `Column ${index + 1}`,
      cc_order: [],
      items_by_cc: new Map(),
    }));

    rows.forEach((_row) => {
      const cells = $(_row).children("td").toArray();
      if (cells.length < 2) return;

      const compute_capability = extract_cell_items($, cells[0]).join(" / ");
      if (!compute_capability) return;

      cells.slice(1).forEach((_cell, index) => {
        const category = categories[index];
        if (!category) return;

        const names = extract_cell_items($, _cell);
        if (!names.length) return;

        let entry = category.items_by_cc.get(compute_capability);
        if (!entry) {
          entry = { names: [], seen: new Set() };
          category.items_by_cc.set(compute_capability, entry);
          category.cc_order.push(compute_capability);
        }

        names.forEach((name) => {
          if (entry.seen.has(name)) return; // the page repeats some GPU names
          entry.seen.add(name);
          entry.names.push({ name, compute_capability });
        });
      });
    });

    const list = categories
      .map((category) => ({
        name: category.name,
        list: category.cc_order.map((cc) => ({
          name: cc,
          list: category.items_by_cc.get(cc).names,
        })),
      }))
      .filter((category) => category.list.length);

    if (list.length) nvidia_gpu_list = list;
  });

  return nvidia_gpu_list;
}

/** True when the GPU list already stored on disk matches the freshly parsed one. */
function is_same_list(file_path, list) {
  try {
    const current_content = JSON.parse(fs.readFileSync(file_path, "utf8"));
    return JSON.stringify(current_content.list) === JSON.stringify(list);
  } catch (e) {
    return false; // missing or corrupted file -> rewrite it
  }
}

async function update_page(page, data_dir) {
  const file_path = path.join(data_dir, page.file);

  const html_content = await get_url_content(page.url);
  const nvidia_gpu_list = extract_gpu_list_from_html_content(html_content);

  if (!nvidia_gpu_list?.length) {
    // Fail loudly: silently skipping the write hides real breakages in CI.
    throw new Error(
      `The list is empty. '${page.url}' may have changed again. Skip saving to file '${file_path}'.`,
    );
  }

  if (is_same_list(file_path, nvidia_gpu_list)) {
    // Keep the previous date_time so an unchanged list does not create a daily commit.
    console.log(`The list of '${page.url}' is unchanged. No need to save to file '${file_path}'.`);
    return;
  }

  const json_content = {
    date_time: process.env._DATE_TIME || new Date().toISOString(),
    list: nvidia_gpu_list,
  };

  if (save_file_sync(file_path, JSON.stringify(json_content, null, 2))) {
    console.log(`The file '${file_path}' has been updated.`);
  } else {
    throw new Error(`Failed to save file '${file_path}'.`);
  }
}

async function main() {
  const data_dir = path.join(__dirname, "./data");
  if (!fs.existsSync(data_dir)) {
    fs.mkdirSync(data_dir, { recursive: true });
  }

  for (const page of PAGES) {
    await update_page(page, data_dir);
  }
}

main().catch((error) => {
  console.error(`Failed to update the GPU list. Error: ${error.message}`);
  process.exit(1);
});
