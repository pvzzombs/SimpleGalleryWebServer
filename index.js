const admin = require("firebase-admin");
const mysql = require("mysql2");
const path = require("path");
const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const fileUpload = require("express-fileupload");

require("dotenv").config();

const debugMode = process.env.DEBUG_MODE == "true" ? true : false;

const dbOptions = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
};

let serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.STORAGE_BUCKET
});

let bucket = admin.storage().bucket();

const app = express();

let connection = mysql.createConnection(dbOptions);

connection.connect();

function killServer(){
  console.log("Server shutdown...");
  process.exit();
}

process.on("SIGINT", function(){
  connection.end();
  killServer();
});

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));

app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(fileUpload());

app.get("/", function(req, res){
  connection.query("SELECT * FROM `" + process.env.DB_TABLE + "`", function(error, results, fields){
    if(error){
      res.send(error);
      throw error;
    }
    //console.log(results);
    //res.render("display", { arr: results });
    res.send(results);
  });
});

app.get("/upload", function(req, res){
  res.render("upload");
});

app.post("/upload", function(req, res){
  const username = process.env.REQ_USERNAME;
  const password = process.env.REQ_PASSWORD;
  if(req.body.username != username || req.body.password != password){
    res.send("Error: Access Denied");
    return;
  }
  if(req.body.id && req.body.description && req.files){
    const id = parseInt(req.body.id);
    const description = req.body.description;
    const image = req.files.image;
    const fileName = image.md5 + image.name;
    if(!debugMode){
      let data = new Uint8Array(image.data);
      let file = bucket.file(fileName);
      file.save(data, {}, function(err){
        if(err){
          //console.log(err);
          res.send("Failed, an error occured.");
          throw err;
        }
        //console.log("========");
        file.getSignedUrl({
          action: "read",
          expires: "03-09-2491"
        }).then(function(results){
          const url = results[0];
          //console.log(url);
          connection.query("INSERT INTO `" + process.env.DB_TABLE + "`(`id`,`filename`,`imageurl`,`description`, `when`) values(?, ?, ?, ?, ?)", [id, fileName, url, description, (new Date())], function(error, results, fields){
            if(error){
              res.send(error);
              throw error;
            }
            res.send("Upload success!");
          })
        });
      });
    }else{
      res.send("[DEBUG] Success!");
    }
  }else{
    res.send("Invalid description or file.");
  }
});

app.get("/del", function(req, res){
  res.render("del");
});

app.post("/del", function(req, res){
  //console.log(req.query);
  //res.send("hmmm");
  if(req.body.id){
    const id = parseInt(req.body.id);
    if(!debugMode){
      connection.query("SELECT * FROM `" + process.env.DB_TABLE + "` WHERE `id` = ?", [id], function(error, results, fields){
        if(error){
          res.send(error);
          throw error;
        }else{
          //console.log(results);
          if(results.length == 1){
            const fileName = results[0].filename;
            connection.query("DELETE FROM `" + process.env.DB_TABLE + "` WHERE `id` = ?", [id], function(error, results, fields){
              if(error){
                res.send(error);
                throw error;
              }else{
                bucket.file(fileName).delete().then(function(){
                  //console.log("Deleted " + fileName);
                });
                res.send("Delete success!");
              }
            });
          }else{
            res.send("Image with ID: " + id + " does not exists.");
          }
        }
      });
    }else{
      res.send("[DEBUG] Success!");
    }
  }else{
    res.send("Invalid ID.");
  }
});

app.listen(3000, function(){
  console.log("Listening at port 3000");
});