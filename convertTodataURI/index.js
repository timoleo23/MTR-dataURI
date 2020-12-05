require('dotenv').config();
const dataURI = require('datauri/sync');
const fs = require('fs');
const path = require("path");
const sharp = require('sharp');
const temp_path = process.env.TMP + '\\';

const default_width = 420;  // default image width if none provided
const default_quality = 80; // value range from 0 (lowest) to 100 (best)
const max_dataURIsize = 30; // value in KByte - Max size for the dataURI content

module.exports = async function (context, req) {
    try {
        if (!req.query.filename) {
          return formatErrMsg(context, `{ "Err" : "filename is not defined", "Details" : "Provide file in query in the form ?filename=" }`, "application/json");
        }

        const [filename, ext] =  getFileName(req.query.filename);

        const width = Number(req.query.width || process.env.DEFAULT_WIDTH || default_width);
        const quality = Number(req.query.quality || process.env.DEFAULT_QUALITY || default_quality);
        const dataURIsize = Number(req.query.dataURIsize || process.env.MAX_DATAURISIZE || max_dataURIsize);

        // Read file from  Azure blob and store to local TEMP folder
        fs.writeFileSync( temp_path + filename + '.' + ext , context.bindings.storage);

        // Resize image and convert to JPEG to compress size via quality
        const image_resized = await sharp(temp_path + filename + '.' + ext)
            .resize(width)
            .jpeg({
                quality : quality
            })
            .toBuffer() 
        
        // Save the resized image to local TEMP folder
        fs.writeFileSync(temp_path + 'resized-' + filename + '.' + ext, image_resized);

        // Generate the DataURI from image and save to local disk
        const meta = dataURI( temp_path + 'resized-' + filename + '.' + ext );
        
        // Check that the DataURI generated file is not above max size value
        const data_size = Number(String(meta.content).length / 1024).toFixed(2)
        if (data_size > dataURIsize) {
            return formatErrMsg(context, 
                `{
                    "Err" : "File size is too high (${data_size}KByte)",
                    "Details" : "Please change image width (${width}) or quality factor (${quality})"
                }`,
                "application/json"
            );
        };

        context.res = {
            status: 200, /* Defaults to 200 */
            body:  meta.content,
            headers:
            {
                "Content-type": "application/octet-stream",
                "Content-Disposition" : `attachment; filename=${filename + '.txt'}`
            }
        }    

        // Clean-up locally created files
        fs.unlinkSync(temp_path + filename + '.' + ext );
        fs.unlinkSync(temp_path + 'resized-' + filename + '.' + ext );
        
      } catch (err) {
        return formatErrMsg(context, `{ "Err": "${err.message}" }`, "application/json");
      }
    };
    
function formatErrMsg(context, message = "Bad Request", ContentType = "text/plain") {
    context.log.error(message);
    context.res = {
        status: 400,
        body: message,
        headers: {
            "Content-Type" : ContentType
        }
    };
    context.done();
}

function getFileName(fileName){
    const extension = path.extname(fileName);
    const file = path.basename(fileName,extension);
    return [file, extension];
}