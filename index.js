const fs = require("fs");
const path = require("path");
const https = require("https");
const cheerio = require("cheerio");

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

function get_url_content(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { rejectUnauthorized: false }, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          resolve(data);
        });
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

function extract_gpus_from_html_content(html_content, file_name)
{
  let nvidia_gpu_list = [];

  try {
    const $ = cheerio.load(html_content);
    $(".panel-group > .panel").each(function (_, _group) {
      let group = $(_group);
      let group_heading = group.find("h2,h3").prop("innerText").trim();
      // console.log(group_heading);
      let group_list = [];

      let sub_groups = group.find("div[class^='col-md']");
      sub_groups.each(function (_, _sub_group) {
        let sub_group = $(_sub_group);
        let sub_group_heading = sub_group.find("h3 > a").text();
        // console.log(`      ${sub_group_heading}`);
        let sub_group_list = [];

        let sub_group_items = sub_group.find("tbody > tr");
        sub_group_items.each(function (_, _sub_group_item) {
          let sub_group_item = $(_sub_group_item);
          let card = sub_group_item.find("td");
          if (card.length == 2) { // others maybe hr tag, etc
            let card_name = $(card[0]).text().trim();
            let card_ccap = $(card[1]).text().trim();
            let link = $(card[0]).find("a");
            let card_link = link ? link.attr("href") : "";
            // console.log(`            '${card_name}' - '${card_ccap}'`);

            sub_group_list.push({
              name: card_name,
              compute_capability: card_ccap,
              link: card_link,
            });
          }
        });

        group_list.push({
          name: sub_group_heading,
          list: sub_group_list,
        })
      });

      nvidia_gpu_list.push({
        name: group_heading,
        list: group_list,
      });
    });
  }
  catch (error) {
    console.log("Error Parsing:", error);
  }

  let json_content = {
    // date_time: process.env._DATE_TIME,
    list: nvidia_gpu_list,
  };
  let file_content = JSON.stringify(json_content, null, 2);
  if (save_file_sync(file_name, file_content)) {
    console.log(`The file '${file_name}' has been updated.`);
  }
}

const data_dir = path.join(__dirname, "./data");
if (!fs.existsSync(data_dir)) {
  fs.mkdirSync(data_dir, { recursive: true });
}

get_url_content("https://developer.nvidia.com/cuda-gpus")
  .then((html_content) => {
    extract_gpus_from_html_content(
      html_content,
      path.join(data_dir, "nvidia.com_cuda-gpus.json"),
    );
  })
  .catch((error) => {
    console.error(`Failed to get content of url. Error: ${error.message}`);
  });

get_url_content("https://developer.nvidia.com/cuda-legacy-gpus")
  .then((html_content) => {
    extract_gpus_from_html_content(
      html_content,
      path.join(data_dir, "nvidia.com_cuda-legacy-gpus.json"),
    );
  })
  .catch((error) => {
    console.error(`Failed to get content of url. Error: ${error.message}`);
  });
