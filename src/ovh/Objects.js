import Tools from "../libs/Tools.js";
import HttpRequest from "../libs/HttpRequest.js";
import OvhError from "../exceptions/OvhError.js";
import ObjectsMeta from "./ObjectsMeta.js";
import fs from "fs";

export default class Objects {
  /**
   * Object constructor
   *
   * @param {OVHStorage} context OVHObjectStorage context
   */
  constructor(context, container) {
    this.context = context;
    this.container = container;
    this.object = null;
    this.localPath = context.config.localpath ?? "../../../cloud-storage/";
  }

  use(object) {
    this.object = this.verifyObjectName(object);
    return this;
  }

  verifyObjectName(name) {
    if (Tools.isUndefined(name)) {
      throw new OvhError("Object name is expected.");
    }

    if (Tools.isEmpty(name)) {
      throw new OvhError("Object name is expected.");
    }

    if (!Tools.isString(name)) {
      throw new OvhError("Object name must be a string.");
    }

    if (Tools.contains(name, "/") || Tools.contains(name, " ")) {
      throw new OvhError("Object name contains slash or space.");
    }

    return Tools.toSlug(name);
  }

  setLocalPath(path) {
    if (!fs.existsSync(path)) {
      throw new OvhError(`Object : Path ${path} does not exist.`);
    }
    this.localPath = path;
  }

  verifyObjectExists() {
    if (
      Tools.isUndefined(this.object) ||
      Tools.isEmpty(this.object) ||
      this.object === null
    ) {
      throw new OvhError("You must add object name with use() method.");
    }
  }

  async upload(localFilename, distantFilename) {
    this.object = this.verifyObjectName(distantFilename);
    const path = this.localPath + "/" + localFilename;

    const stats = fs.statSync(path);
    const fileSizeInBytes = stats.size;

    let stream = fs.createReadStream(path);

    const req = new HttpRequest(this.context);
    req.addHeaders({
      "Content-length": fileSizeInBytes,
    });

    const response = await req.uploadStream(
      "/" + this.container + "/" + this.object,
      stream
    );
    stream.close();

    return response.headers.raw();
  }

  async download(path) {
    if (!this.exist()) {
      throw new OvhError(
        `Object ${this.object} does not exist in container ${this.container}`
      );
    }

    const finalPath = this.localPath + path;

    // Test if path exist to store the file
    let testPath = finalPath.split("/");
    testPath.pop(); // without filename because it does not exist at this moment ^^
    testPath = testPath.join("/");
    if (!fs.existsSync(testPath)) {
      throw new OvhError(`Object.download : Path ${testPath} does not exist.`);
    }

    const req = new HttpRequest(this.context);
    const response = await req.get("/" + this.container + "/" + this.object);
    await response.body.pipe(fs.createWriteStream(finalPath));
    return response.headers.raw();
  }

  async downloadStream(out) {
    if (!this.exist()) {
      throw new OvhError(
        `Object ${this.object} does not exist in container ${this.container}`
      );
    }

    const req = new HttpRequest(this.context);
    const response = await req.get("/" + this.container + "/" + this.object);
    await response.body.pipe(out);
    return response.headers.raw();
  }

  async exist() {
    this.verifyObjectExists();

    const req = new HttpRequest(this.context);
    req.disabledCheckResponseStatus();

    const response = await req.get("/" + this.container + "/" + this.object);

    if (response.status === 404) {
      return false;
    }

    return true;
  }

  async info() {
    if (!this.exist()) {
      throw new OvhError(
        `Object ${this.object} does not exist in container ${this.container}`
      );
    }

    const req = new HttpRequest(this.context);
    const response = await req.head("/" + this.container + "/" + this.object);

    return response.headers.raw();
  }

  async get() {
    if (!this.exist()) {
      throw new OvhError(
        `Object ${this.object} does not exist in container ${this.container}`
      );
    }

    const req = new HttpRequest(this.context);
    const response = await req.get("/" + this.container + "/" + this.object);
    return await response.buffer();
  }

  async copy(container, filename = null) {
    //todo : v2
  }

  async delete() {
    if (!this.exist()) {
      throw new OvhError(
        `Object ${this.object} does not exist in container ${this.container}`
      );
    }

    const req = new HttpRequest(this.context);
    const response = await req.delete("/" + this.container + "/" + this.object);
    return response.headers.raw();
  }

  async deleteMany(filenames) {
    if (!Array.isArray(filenames)) {
      throw new OvhError(
        `Object.deleteMany : You must provide an array of filenames`
      );
    }

    let result = [];
    filenames.forEach(async (filename) => {
      let tmp = await this.use(filename).delete();
      result.push(tmp);
    });

    return result;
  }

  async metas() {
    const path = this.container + "/" + this.object;
    const headers = await this.info();
    return new ObjectsMeta(this.context, path, headers);
  }
}
