window.$ = window.jQuery = require('jquery');

var THREE = require('three');
var TrackballControls = require('three.trackball');

var StackViewer = function(parameters) {
    /**
     * Initialize Defaults
     */
    var defaults = {
        substacks: [],
        color: {},
        canvasDimenstions: [1000, 1000],
        stackDimensions: null, //will be calculated otherwise
        showKey: true,
        showSubStacks: true,
        element: 'document',
        rotate: true,
        modal: false, //requires bootstrap to display modal
    };

    var conf = $.extend({}, parameters);
    var cfg = $.extend(true, {}, defaults, conf);
    var self = this;

    this.init = function() {
        //Setup Variables
        var roi, ratio, light, lx, ly, lz, stackMaxDimension;

        if (!cfg.stackDimensions) {
            cfg.stackDimensions = [0, 0, 0];
            var ssx, ssy, ssz;
            cfg.substacks.forEach(function(ss) {
                ssx = ss.x + ss.width;
                ssy = ss.z + ss.height;
                ssz = ss.y + ss.length;
                if (ssx > cfg.stackDimensions[0]) cfg.stackDimensions[0] = ssx;
                if (ssy > cfg.stackDimensions[1]) cfg.stackDimensions[1] = ssy;
                if (ssz > cfg.stackDimensions[2]) cfg.stackDimensions[2] = ssz;
            });
        }
        stackMaxDimension = Math.max(cfg.stackDimensions[0], cfg.stackDimensions[1], cfg.stackDimensions[2]);

        this.objects = [];
        this.intersects = [];
        this.mouse = new THREE.Vector2();
        this.should_rotate = cfg.rotate;


        //Objects
        roi = new THREE.Object3D();
        cfg.substacks.forEach(function(ss) {
            var geometry, mesh, material, user_id, color;
            geometry = new THREE.BoxGeometry(ss.width, ss.height, ss.length);
            if (ss.status.constructor === Array) {
                geometry.faces.forEach(function(face, idx) {
                    user_id = ss.status[idx % ss.status.length];
                    color = cfg.colors[user_id].color;
                    face.color.set(color);
                    material = new THREE.MeshLambertMaterial({
                        ambient: 0x808080,
                        vertexColors: THREE.FaceColors,
                        transparent: true,
                    });
                });
            } else {
                material = new THREE.MeshLambertMaterial({
                    ambient: 0x808080,
                    color: cfg.colors[ss.status].color,
                    transparent: true,
                });
            }
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.x = ss.x;
            mesh.position.y = stackMaxDimension - ss.z;
            mesh.position.z = ss.y;
            mesh.name = ss.id;
            mesh.info = ss;
            roi.add(mesh);
            self.objects.push(mesh);

        });
        roi.position.x = -(stackMaxDimension / 2);
        roi.position.y = -(stackMaxDimension / 2);
        roi.position.z = -(stackMaxDimension / 2);
        this.roi_rot = new THREE.Object3D();
        this.roi_rot.add(roi);

        //Camera
        ratio = cfg.canvasDimenstions[0] / cfg.canvasDimenstions[1];
        this.camera = new THREE.OrthographicCamera((ratio * stackMaxDimension) / -2, (ratio * stackMaxDimension) / 2, stackMaxDimension / 2, stackMaxDimension / -2, 1, 100000);
        //camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 100000);
        this.camera.position.z = stackMaxDimension;
        this.camera_position = this.camera.position.clone();
        this.camera_rotation = this.camera.rotation.clone();

        //Scene
        this.scene = new THREE.Scene();
        this.scene.add(this.roi_rot);

        //Lights
        light = new THREE.DirectionalLight(0xffffff, 0.8);
        lx = stackMaxDimension * Math.sin(Math.PI / 8);
        lz = stackMaxDimension * Math.cos(Math.PI / 8);
        ly = stackMaxDimension * 0.5;
        light.position.set(lx, ly, lz);
        this.scene.add(light);
        lx = stackMaxDimension * Math.sin(9 * Math.PI / 8);
        lz = stackMaxDimension * Math.cos(9 * Math.PI / 8);
        ly = -ly;
        light = new THREE.DirectionalLight(0xffffff, 0.8);
        light.position.set(lx, ly, lz);
        this.scene.add(light);
        light = new THREE.AmbientLight(0x404040); // soft white light
        this.scene.add(light);

        //Renderer
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(cfg.canvasDimenstions[0], cfg.canvasDimenstions[1]);
        this.renderer.setClearColor(0xffffff, 1);

        //Add to html
        $(cfg.element).append(this.renderer.domElement);
        $(this.renderer.domElement).css('position', 'static');
        this.controls = new TrackballControls(this.camera, this.renderer.domElement);

        if (cfg.showKey) {
            this.melement = createMetadataElement(cfg.colors);
            $(cfg.element).append(this.melement);
        }
        if (cfg.showSubStacks) {
            this.renderer.domElement.addEventListener('mousedown', onDocumentMouseDown.bind(this), false);
        }

        //Animate
        this.animate();
        return this;
    };

    this.destroy = function() {
        cancelAnimationFrame(this.animationFrame);// Stop the animation
        this.scene = null;
        this.renderer = null;
        this.camera = null;
        this.controls = null;
        $(cfg.element).empty();
    };

    this.animate = function() {
        this.animationFrame = requestAnimationFrame(self.animate.bind(this));
        if (self.should_rotate) self.roi_rot.rotateOnAxis(new THREE.Vector3(0, 1, 0), 0.01);
        self.controls.update();
        self.renderer.render(self.scene, self.camera);
    };

    this.createSubstackPopup = function(substack) {
        var sdiv, htmlStr, leftOffset, offset;
        sdiv = document.createElement('div');
        sdiv.id = 'substack_data';
        sdiv.style.position = 'absolute';
        offset = $(this.renderer.domElement).offset();
        sdiv.style.top = offset.top + "px";
        leftOffset = offset.left - 10;
        if (leftOffset < 0) leftOffset = 0;
        sdiv.style.left = leftOffset + 'px';
        sdiv.style.padding = 2 + 'px';
        htmlStr = substackPopupText(substack);
        sdiv.innerHTML = htmlStr;
        return sdiv;
    };

    this.snapto = function(plane) {
        var roi_x = 0,
            roi_y = 0,
            roi_z = 0;
        //stop auto rotation
        this.should_rotate = false;
        resetCamera();
        //reset position
        this.roi_rot.lookAt(new THREE.Vector3(0, 0, 0));
        //set rotation axis
        if (plane == 'xz') roi_y = 1;
        if (plane == 'xy') roi_x = 1;
        //rotate to new position
        this.roi_rot.rotateOnAxis(new THREE.Vector3(roi_x, roi_y, roi_z), Math.PI / 2);
    };

    var substackPopupText = function(substack) {
        var htmlStr;
        htmlStr = "<div style='font-weight:bold'>" + substack.name + "</div>" +
            "<div>x: " + substack.info.x + "</div>" +
            "<div>y: " + substack.info.y + "</div>" +
            "<div>z: " + substack.info.z + "</div>" +
            "<div>width: " + substack.info.width + "</div>" +
            "<div>height: " + substack.info.height + "</div>" +
            "<div>length: " + substack.info.length + "</div>";
        if ('annotations' in substack.info) {
            htmlStr += "<div>annotations: " + substack.info.annotations + "</div>";
        }
        return htmlStr;
    }

    var empty = function(el) {
        console.log(el);
        while (el.lastChild) el.removeChild(el.lastChild);
    };

    var onDocumentMouseDown = function(event) {
        event.preventDefault();
        var vector, dir, raycaster, offset, scrollTop, scrollLeft, substackPopup, modal;
        offset = $(this.renderer.domElement).offset();
        scrollTop = $(document).scrollTop();
        scrollLeft = $(document).scrollLeft()
        self.mouse.x = (((event.clientX - offset.left + scrollLeft) / self.renderer.domElement.width) * self.renderer.devicePixelRatio) * 2 - 1;
        self.mouse.y = -(((event.clientY - offset.top - scrollTop) / self.renderer.domElement.height) * self.renderer.devicePixelRatio) * 2 + 1;
        vector = new THREE.Vector3(self.mouse.x, self.mouse.y, -1);
        vector.unproject(self.camera);
        dir = new THREE.Vector3();
        dir.set(0, 0, -1).transformDirection(self.camera.matrixWorld);
        raycaster = new THREE.Raycaster();
        raycaster.set(vector, dir);
        self.should_rotate = false;
        if (self.intersects.length) {
            self.intersects.forEach(function(el) {
                el.object.material.ambient.setHex(0x808080);
            });
        }
        self.intersects = raycaster.intersectObjects(self.objects);
        $('#substack_data').remove();
        if (self.intersects.length > 0) {
            self.intersects.some(function(el, idx) {
                if (el.object.material.opacity == 1.0) {
                    self.intersects[idx].object.material.ambient.setRGB(0, 0, 0);
                    if (cfg.modal) {
                        modal = wrapPopupInModal(substackPopupText(self.intersects[idx].object));
                        $(cfg.element).append(modal);
                        $('#stack3d_stats_modal').modal('toggle');
                        $('#stack3d_stats_modal').on('hidden.bs.modal', function(){
                            this.remove();
                        });
                    }
                    else {
                        substackPopup = self.createSubstackPopup(self.intersects[idx].object);
                        $(cfg.element).append(substackPopup);
                    }
                    return true; //breaks out of some loop
                }
            });
        }
    };

    var wrapPopupInModal = function(popup) {
        var preModal, postModal, modalDiv;
        modalDiv = document.createElement('div');
        preModal = '<div id="stack3d_stats_modal" class="modal fade">\
                    <div class="modal-dialog">\
                    <div class="modal-content">\
                    <div class="modal-body">';
        postModal = '</div>\
        </div>\
        </div>\
        </div>';
        modalDiv.innerHTML = preModal + popup + postModal;
        return modalDiv;
    }

    var createMetadataElement = function(metadata) {
        var metadiv, toinnerhtml, offset;

        function convertToHexColor(i) {
            var result = "#000000";
            if (i >= 0 && i <= 15) {
                result = "#00000" + i.toString(16);
            } else if (i >= 16 && i <= 255) {
                result = "#0000" + i.toString(16);
            } else if (i >= 256 && i <= 4095) {
                result = "#000" + i.toString(16);
            } else if (i >= 4096 && i <= 65535) {
                result = "#00" + i.toString(16);
            } else if (i >= 65536 && i <= 1048575) {
                result = "#0" + i.toString(16);
            } else if (i >= 1048576 && i <= 16777215) {
                result = "#" + i.toString(16);
            }
            return result;
        }
        metadiv = document.createElement('div');
        metadiv.id = 'node_key';
        metadiv.style.position = 'absolute';
        offset = $(self.renderer.domElement).offset();
        metadiv.style.top = offset.top + "px";
        var offsetright = ($(window).width() - (offset.left + $(self.renderer.domElement).outerWidth()));
        metadiv.style.right = (offsetright + 10) + 'px';
        metadiv.style.border = "solid 1px #aaaaaa";
        metadiv.style.borderRadius = "5px";
        metadiv.style.padding = "2px";
        toinnerhtml = "";
        Object.keys(metadata).forEach(function(m) {
            var mtype = parseInt(m);
            var three_color = metadata[mtype].color;
            var css_color = three_color;
            if (typeof three_color != 'string') css_color = convertToHexColor(three_color);
            //do this via templates
            toinnerhtml += "<div><span style='height:10px;width:10px;background:" + css_color +
                ";display:inline-block;'></span> : " + metadata[m].name + "</div>";
        });
        metadiv.innerHTML = toinnerhtml;
        return metadiv;
    };

    var resetCamera = function() {
        self.camera.position.set(self.camera_position.x, self.camera_position.y, self.camera_position.z);
        self.camera.up.set(0, 1, 0);
    };

};

module.exports = StackViewer;

