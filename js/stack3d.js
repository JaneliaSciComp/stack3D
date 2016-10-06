window.$ = window.jQuery = require('jquery');

var THREE = require('three');
var TrackballControls = require('three.trackball');
window.chroma = require('chroma-js');


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
        metadataTop: false,
        camera: 'ortho', //or 'perspective'
        modal: false, //requires bootstrap to display modal
        colorInterpolate : [], //requires chroma.js and that all statuses can be cast as floats
        metadataRange: [], //only useful if you are using color interpolate
    };

    var conf = $.extend({}, parameters);
    var cfg = $.extend(true, {}, defaults, conf);
    var self = this;

    this.init = function() {
        //Setup Variables
        var roi, ratio, light, lx, ly, lz, stackMaxDimension, colorScale, statusScale;

        metadataRanges = {}
        if (!cfg.stackDimensions) {
            //cfg.stackDimensions = [0, 0, 0];

            cfg.stackDimensions = {
                hmax: null,
                hmin: null,
                lmin: null,
                lmax: null,
                wmin: null,
                wmax: null,
            };

            var ssx, ssy, ssz;
            cfg.substacks.forEach(function(ss) {
                Object.keys(ss).sort().forEach( function (key) {
                    if ($.isNumeric(ss[key])) {
                        // push to array
                        if (! (key in metadataRanges)){
                            metadataRanges[key] = [];
                        }
                        metadataRanges[key].push(ss[key])
                    }
                    else {
                        metadataRanges[key] = false;
                    }
                });
                sswidth = ss.x + ss.width;
                ssheight = ss.z + ss.height;
                sslength = ss.y + ss.length;
                // if (sswidth > cfg.stackDimensions[0]) cfg.stackDimensions[0] = sswidth;
                // if (ssheight > cfg.stackDimensions[1]) cfg.stackDimensions[1] = ssheight;
                // if (sslength > cfg.stackDimensions[2]) cfg.stackDimensions[2] = sslength;
                // z and y are swapped in three js world
                if (cfg.stackDimensions.wmin == null || ss.x < cfg.stackDimensions.wmin) cfg.stackDimensions.wmin = ss.x;
                if (cfg.stackDimensions.wmax == null || sswidth > cfg.stackDimensions.wmax) cfg.stackDimensions.wmax = sswidth;
                if (cfg.stackDimensions.lmin == null || ss.y < cfg.stackDimensions.lmin) cfg.stackDimensions.lmin = ss.y;
                if (cfg.stackDimensions.lmax == null || sslength > cfg.stackDimensions.lmax) cfg.stackDimensions.lmax = sslength;
                if (cfg.stackDimensions.hmin == null || ss.z < cfg.stackDimensions.hmin) cfg.stackDimensions.hmin = ss.z;
                if (cfg.stackDimensions.hmax == null || ssheight > cfg.stackDimensions.hmax) cfg.stackDimensions.hmax = ssheight;
            });
        }
        stackMaxDimension = Math.max(cfg.stackDimensions.wmax, cfg.stackDimensions.lmax, cfg.stackDimensions.hmax);
        metadataKeys = Object.keys(metadataRanges);
        metadataKeys.forEach( function(item){
            if (metadataRanges[item]) {
                var range = metadataRanges[item];
                range.sort(function(a, b){return a-b});
                metadataRanges[item] = [range[0], range[range.length - 1]];
            }
            else {
                delete metadataRanges[item];
            }
        });
        this.metadataRanges = metadataRanges;

        this.objects = [];
        this.intersects = [];
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.should_rotate = cfg.rotate;


        //Objects
        roi = new THREE.Object3D();
        if (cfg.colorInterpolate.length) {
            colorScale = chroma.scale(cfg.colorInterpolate);
            this.colorScale = colorScale;

            if (! cfg.metadataRange.length) cfg.metadataRange = [Infinity,0];
            cfg.substacks.forEach( function(ss) {
                if (parseFloat(ss.status) < cfg.metadataRange[0]) cfg.metadataRange[0] = parseFloat(ss.status);
                if (parseFloat(ss.status) > cfg.metadataRange[1]) cfg.metadataRange[1] = parseFloat(ss.status);
            });
        }

        cfg.substacks.forEach(function(ss) {
            var geometry, mesh, material, user_id, color;
            geometry = new THREE.BoxGeometry(ss.width, ss.height, ss.length);
            if (ss.status.constructor === Array) {
                geometry.faces.forEach(function(face, idx) {
                    user_id = ss.status[idx % ss.status.length];
                    if (cfg.colorInterpolate.length) {
                        color = colorScale((parseFloat(ss.status)-cfg.metadataRange[0])/ (cfg.metadataRange[1]-cfg.metadataRange[0])).hex();
                    }
                    else {
                        color = cfg.colors[user_id].color;
                    }
                    face.color.set(color);
                    material = new THREE.MeshLambertMaterial({
                        ambient: 0x808080,
                        vertexColors: THREE.FaceColors,
                        transparent: true,
                    });
                });
            } else {
                if (cfg.colorInterpolate.length) {
                    var fraction = (parseFloat(ss.status)-cfg.metadataRange[0])/ (cfg.metadataRange[1]-cfg.metadataRange[0]);
                    color = colorScale(fraction).hex();
                }
                else {
                    color = cfg.colors[ss.status].color;
                }
                material = new THREE.MeshLambertMaterial({
                    ambient: 0x808080,
                    color: color,
                    transparent: true,
                });
            }
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.x = ss.x;
            mesh.position.y = cfg.stackDimensions.hmax - ss.z;
            mesh.position.z = ss.y;
            mesh.name = ss.id;
            mesh.info = ss;
            roi.add(mesh);
            self.objects.push(mesh);

        });

        roi.position.y = -((cfg.stackDimensions.hmax - cfg.stackDimensions.hmin) /2);
        roi.position.z = -(cfg.stackDimensions.lmin + ((cfg.stackDimensions.lmax - cfg.stackDimensions.lmin) /2));
        roi.position.x = -(cfg.stackDimensions.wmin + ((cfg.stackDimensions.wmax - cfg.stackDimensions.wmin) /2));
        this.roi_rot = new THREE.Object3D();
        this.roi_rot.add(roi);

        //Camera
        ratio = cfg.canvasDimenstions[0] / cfg.canvasDimenstions[1];
        if (cfg.camera === 'ortho') {
            this.camera = new THREE.OrthographicCamera((ratio * stackMaxDimension) / -2, (ratio * stackMaxDimension) / 2, stackMaxDimension / 2, stackMaxDimension / -2, 1, 100000);
        }
        else {
            this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 100000);
        }
        this.camera.position.z = stackMaxDimension * 1.5;

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
        this.renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
        this.renderer.setSize(cfg.canvasDimenstions[0], cfg.canvasDimenstions[1]);
        this.renderer.setClearColor(0xffffff, 1);

        //Add to html
        $(cfg.element).append(this.renderer.domElement);
        $(this.renderer.domElement).css('position', 'static');
        this.controls = new TrackballControls(this.camera, this.renderer.domElement);

        if (cfg.showKey) {

            this.melement = (cfg.colorInterpolate.length)? createMetadataElement(colorScale, cfg.metadataRange): createMetadataElement();
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

    this.getRanges = function() {
        return this.metadataRanges;
    }

    this.createSubstackPopup = function(substack) {
        var sdiv, htmlStr, leftOffset, offset, additionalTopOffset;
        sdiv = document.createElement('div');
        sdiv.id = 'substack_data';
        sdiv.style.position = 'absolute';
        offset = $(this.renderer.domElement).position();
        additionalTopOffset = (cfg.metadataTop)? 25 : 0;
        sdiv.style.top = offset.top + additionalTopOffset + "px";
        leftOffset = offset.left - 10;
        if (leftOffset < 0) leftOffset = 0;
        sdiv.style.left = leftOffset + 'px';
        sdiv.style.padding = 2 + 'px';
        htmlStr = substackPopupText(substack);
        sdiv.innerHTML = htmlStr;
        return sdiv;
    };

    this.screenshot = function() {
        var dataURI;
        dataURI = this.renderer.domElement.toDataURL("application/octet-stream");
        downloadLink = document.createElement('a');
        $(downloadLink).attr('href', dataURI);
        $(downloadLink).attr('download', 'stack3d.png');
        downloadLink.click();
        $(downloadLink).remove();
        return false;
    }

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

    this.ghost = function(plane, min, max) {
        var pos
        max = max || false;
        this.roi_rot.children[0].children.forEach(function(el, idx) {
                if (plane === 'x') pos = el.position.x;
                if (plane === 'y') pos = el.position.z;
                if (plane === 'z') pos = el.position.y;
                if (pos > min && (max === false || pos < max)) {
                    el.material.opacity = 1.0;
                }
                else {
                     el.material.opacity = 0.1;
                }
        })
    }
    this.recolor = function(info_item) {
        var info_range = [];
        this.roi_rot.children[0].children.forEach( function(el, idx) {
            info_range.push(el.info[info_item]);
        })
        info_range.sort(function(a, b){return a-b});
        var color_range_min = info_range[0];
        var color_range_max = info_range[info_range.length - 1];
        var that = this;
        this.roi_rot.children[0].children.forEach( function(el, idx) {
            var fraction = ( parseFloat( el.info[info_item] ) - color_range_min)/ (color_range_max - color_range_min);
            color = that.colorScale(fraction).rgb();
            el.material.color.setRGB(color[0]/255, color[1]/255, color[2]/255);
        });
        var melement = createMetadataElement(this.colorScale, [color_range_min, color_range_max]);
        var mid = melement.id;
        $('#' + mid).html(melement.innerHTML);
    }

    var substackPopupText = function(substack) {
        var htmlStr;
        htmlStr = "<div style='font-weight:bold'>" + substack.name + "</div>";
        Object.keys(substack.info).sort().forEach( function (key) {
            if ($.isNumeric(substack.info[key]) && (substack.info[key] % 1 !== 0)) {
                htmlStr += "<div>" + key + ": " + substack.info[key].toFixed(2) + "</div>";
            }
            else {
                htmlStr += "<div>" + key + ": " + substack.info[key] + "</div>";
            }
        });
        return htmlStr;
    }

    var empty = function(el) {
        while (el.lastChild) el.removeChild(el.lastChild);
    };

    var onDocumentMouseDown = function(event) {
        //only show modal on click, not on drag
        $(event.target).on('mouseup mousemove', function handler(event) {
            self.should_rotate = false;
            if (event.type === 'mouseup') {
                event.preventDefault();
                var vector, dir, offset, scrollTop, scrollLeft, substackPopup, modal;
                offset = $(self.renderer.domElement).offset();
                scrollTop = $(document).scrollTop();
                scrollLeft = $(document).scrollLeft()
                self.mouse.x = ((event.clientX - offset.left + scrollLeft) / self.renderer.domElement.width) * 2 - 1;
                self.mouse.y = -((event.clientY - offset.top - scrollTop) / self.renderer.domElement.height) * 2 + 1;
                self.raycaster.setFromCamera(self.mouse, self.camera);
                if (self.intersects.length) {
                    self.intersects.forEach(function(el) {
                        el.object.material.ambient.setHex(0x808080);
                    });
                }
                self.intersects = self.raycaster.intersectObjects(self.objects);
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
            }
            $(event.target).off('mouseup mousemove', handler);
        });
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

    var createMetadataElement = function(scale, minmax) {
        console.log(scale, minmax);
        var metadiv, toinnerhtml, offset, offsetright, elType, elStyle;
        var myscale = scale || false;

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
        offset = $(self.renderer.domElement).position();
        metadiv.style.top = offset.top + "px";
        if (! cfg.metadataTop) {
            offsetright = ($(window).width() - (offset.left + $(self.renderer.domElement).outerWidth()));
            metadiv.style.right = (offsetright + 10) + 'px';
        }
        metadiv.style.border = "solid 1px #aaaaaa";
        metadiv.style.borderRadius = "5px";
        metadiv.style.padding = "2px";
        toinnerhtml = "";
        if (cfg.metadataTop) {
            elType = 'span';
            elStyle = '';
        }
        else {
            elType = "div";
            elStyle = ' style="line-height:0;" ';
        }

        if (cfg.colorInterpolate.length) {
            //create interpolate scheme
            toinnerhtml += "<" + elType + ">" + parseFloat(minmax[0]).toFixed(1) + "</" + elType + ">";
            for (var i = 0; i <= 10; i += 1) {
                toinnerhtml += "<" + elType + elStyle + "><span style='height:10px;width:20px;background:" + scale(i/10.0) +
                    ";display:inline-block;'></span></" + elType + ">";
            }
            toinnerhtml += "<" + elType + ">" + parseFloat(minmax[1]).toFixed(1) + "</" + elType + ">";
        }
        else {
            Object.keys(cfg.colors).forEach(function(m) {
                var mtype = parseInt(m);
                var three_color = cfg.colors[mtype].color;
                var css_color = three_color;
                if (typeof three_color != 'string') css_color = convertToHexColor(three_color);
                //do this via templates
                toinnerhtml += "<" + elType + elStyle + "><span style='margin-left: 5px;height:10px;width:10px;background:" + css_color +
                    ";display:inline-block;'></span> : " + cfg.colors[m].name + "</" + elType + ">";
            });
        }
        metadiv.innerHTML = toinnerhtml;
        return metadiv;
    };

    var resetCamera = function() {
        self.camera.position.set(self.camera_position.x, self.camera_position.y, self.camera_position.z);
        self.camera.up.set(0, 1, 0);
    };

};

module.exports = StackViewer;
