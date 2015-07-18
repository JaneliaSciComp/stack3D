module.exports = function(grunt) {

  // load npm modules at runtime -- cleans up config file
  require('jit-grunt')(grunt);

    // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    browserify: {
      app:          {
        options: {
            transform:  [ require('grunt-react').browserify ]
        },
        src:        'js/stack3D.js',
        dest:       'build/js/bundle.js'
      },
    },
    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
      },
      build: {
        src: 'build/js/bundle.js',
        dest: 'build/js/bundle.min.js'
      }
    },
    copy: {
        main: {
                files: [
                    {
                        src: 'example/test.html',
                        dest: 'build/test.html'
                    }
                ]
        }
    },
    watch: {
      scripts: {
        files: ['example/test.html', 'js/stack3d.js'],
        tasks: ['browserify', 'uglify', 'copy']
      }
    }
  });

  // Default task(s).
  grunt.registerTask('default', ['browserify:app', 'copy', 'watch']);
};
