// A dummy human agend which always do nothing.
// Always do nothing to let the player take control.
function Human() {
    this.results = [];
    this.iteration = 0;
    return this;
};

Human.prototype = {
    /**
     * Always do nothing.
     * @return {state: int, action: string}
     */
    act: function (runner, reward) {
        var result = {
            state: -1,
            action: QLearner.actions.NOTHING
        };
        this.iteration = 0;
        return result;
    },
    dump: function () {
        return null;
    },
    isTrain: function() {
        return false;
    },
    /**
     * Do nothing.
     * @return {boolean/string}
     * return true if succeed, or the reason if failed.
     */
    load: function (model) {
        return "The model is in your mind!";
    },
    appendResult: function(result) {
        this.results.push([this.iteration, result]);
    },
    dumpResult: function () {
        var csvContent = "";
        for(var i = 0; i < this.results.length; i++) {
            dataString = this.results[i].join(",");
            csvContent += i < this.results.length - 1 ? dataString + "\n" : dataString;
        }
        return { text: csvContent, fn: "result-dql.csv" };
    },
};

function QLearner(typeConfig) {
    this.type = typeConfig;
    this.train();
    return this;
};

/**
 * All the possible actions.
 * @enum {string}
 */
QLearner.actions = {
    NOTHING: 0,
    JUMP: 1,
    DUCK: 2
};

function clamp(x, a, b) {
    return Math.min(Math.max(x, a), b);
};
function quantify(x, divider, timer, a, b) {
    return clamp(
        Math.ceil(x / divider * timer) - 1,
        a, b
    );
};

QLearner.types = {
    /**
     * This Q-Learner only uses the information of the first obstacle.
     * It contains four numbers:
     * xPos: divided by the canvas length and quantified at 0.1 step from 0 to 1 (excluded).
     * yPos: divided by the canvas height and quantified at 0.1 step.
     * width: divided by HALF the canvas length and quantified at 0.1 step from 0 to 1 (excluded).
     * height:
     * Notice that the last state is used for no obstacles.
     */
    SingleObstacleX: {
        type: "singleObstacleX",
        total_iters: 100000,
        states: 51,
        actions: 2,
        alpha: 0.7,
        gamma: 1.0,
        /**
         * Get the encoding of the current state.
         * Return state in [0, states)
         * @return {int}
         */
        get_state: function (runner) {
            if (runner.horizon.obstacles.length == 0) {
                // There is no obstacles.
                return 0;
            }
            var obstacle = runner.horizon.obstacles[0];
            var x = quantify(obstacle.xPos, runner.dimensions.WIDTH, 50, 0, 49);
            // var y = quantify(obstacle.yPos, runner.dimensions.HEIGHT, 10, 0, 9);
            // var w = quantify(obstacle.width, runner.dimensions.WIDTH / 4, 10, 0, 9);
            // var h = quantify(obstacle.typeConfig.height, runner.dimensions.HEIGHT / 4, 10, 0, 9);
            // var state = w * 1000 + h * 100 + y * 10 + x + 1;
            // var state = y * 100 + w * 10 + x + 1;
            var state = x + 1;
            return state;
        }
    },
    /**
     * This Q-Learner only uses the information of the first obstacle.
     * It contains four numbers:
     * xPos: divided by the canvas length and quantified at 0.1 step from 0 to 1 (excluded).
     * yPos: divided by the canvas height and quantified at 0.1 step.
     * width: divided by HALF the canvas length and quantified at 0.1 step from 0 to 1 (excluded).
     * height:
     * Notice that state 0 is used for no obstacles.
     */
    SingleObstacleXYW: {
        type: "singleObstacleXYW",
        total_iters: 100000,
        states: 20 + 1,
        actions: 2,
        alpha: 0.7,
        gamma: 1.0,
        buffer_size: 50,
        result_max_size: 10000,
        /**
         * Get the encoding of the current state.
         * Return state in [0, states)
         * @return {int}
         */
        get_state: function (runner) {
            if (runner.horizon.obstacles.length == 0) {
                // There is no obstacles.
                return 0;
            }
            var obstacle = runner.horizon.obstacles[0];
            var x = quantify(obstacle.xPos, runner.dimensions.WIDTH, 20, 0, 19);
            //var obstacleHeight = quantify(obstacle.yPos, runner.dimensions.HEIGHT, 10, 0, 9);
            //var w = quantify(obstacle.width, runner.dimensions.WIDTH / 4, 10, 0, 9);
            //var tRexHeight = quantify(100 - runner.tRex.yPos, 100, 10, 0, 9);
            //var speed = quantify(runner.currentSpeed - 6 + obstacle.speedOffset, 8, 10, 0, 9);

            //var state = 100 * speed + 10 * obstacleHeight + x + 1;

            var state = x + 1;
            return state;
        }
    }
};

QLearner.initialResult = {
    action: QLearner.actions.NOTHING,
    state: 0
}

QLearner.prototype = {

    /**
     * Take the best action according to the current state.
     * @return {state: int, action: string}
     */
    act: function (runner, reward) {
        var state = this.type.get_state(runner);
        var action = this.act_(state);
        var result = {
            state: state,
            action: action
        };
        
        // Update the Q table if we are still learning.
        // if (this.iter < this.type.total_iters && (this.history.state != state || reward < 0)) {
        if ( this.iter < this.type.total_iters && (this.history.state != state || reward < 0)) {
            // the state has changed or the collision happened
            if(reward < 0) {
                // just hit an obstacle, update the table, reset states
                this.update_(this.prev_ground_res.state, this.prev_ground_res.action, reward, state);
                this.iter++;
 
                this.prev_ground_res = QLearner.initialResult;
                this.history = QLearner.initialResult;
            } else {
                if( runner.tRex.jumping ) {
                    // change the state without updating the table
                    this.history = result;
                } else {
                    // check if it just landed
                    if(this.history != this.prev_ground_res) {
                        reward = 1;
                    }

                    this.update_(this.prev_ground_res.state, this.prev_ground_res.action, reward, state);
                    this.iter++;

                    this.history = result;
                    this.prev_ground_res = result;
                }
            }
            document.getElementById("iteration-panel").innerHTML = "iteration: " + this.iter;

            
            for(var i = 0; i < this.type.buffer_size - 1; i++) {
                this.buffer_actions[this.type.buffer_size - i - 1] = this.buffer_actions[this.type.buffer_size - i - 2]
                this.buffer_states[this.type.buffer_size - i - 1] = this.buffer_states[this.type.buffer_size - i - 2];
            }
            this.buffer_actions[0] = action;
            this.buffer_states[0]  = state;
  
            if (reward < 0) {
                history_series = "";
                for(var i = 0; i < this.type.buffer_size; i++) {
                    history_series += " (" + this.buffer_states[this.type.buffer_size - i - 1] + "," + this.buffer_actions[this.type.buffer_size - i - 1] + ")"
                }
                console.log(history_series);
            }
        }
        return result;
    },

    /**
     * Dump the table to a csv file.
     * @return {string}
     */
    dump: function () {
        var csvContent = "";
        this.table.forEach(function (infoArray, index) {
            dataString = infoArray.join(",");
            csvContent += index < this.table.length ? dataString + "\n" : dataString;
        }.bind(this));
        return { text: csvContent, fn: "q-table.csv" };
    },

    appendResult: function(distance) {
        this.resultTable[this.gameNumber][0] = this.iter;
        this.resultTable[this.gameNumber][1] = distance;
        this.gameNumber++;
    },
     /**
     * Dump the result to a csv file.
     * @return {string}
     */
    dumpResult: function () {
        var csvContent = "";
        for(var i = 0; i < this.gameNumber; i++) {
            dataString = this.resultTable[i].join(",");
            csvContent += i < this.gameNumber - 1 ? dataString + "\n" : dataString;
        }
        return { text: csvContent, fn: "result.csv" };
    },


    /**
     * Load the model and stop learning by setting this.iter.
     * @return {boolean/string}
     * return true if succeed, or the reason if failed.
     */
    load: function (model) {
        // Stop training.
        this.iter = this.type.total_iters;
        // Load in the table.
        var lines = model.split('\n');
        if (lines.length < this.table.length) {
            return "The number of states is not correct!";
        }
        for (var i = 0; i < this.table.length; ++i) {
            var entries = lines[i].split(',');
            if (entries.length != this.table[i].length) {
                return "The number of entries is not correct!";
            }
            for (var j = 0; j < entries.length; ++j) {
                this.table[i][j] = Number(entries[j]);
            }
        }
        return true;
    },

    /**
     * Reset the model and start training.
     * @return {boolean/string}
     * return true if succeed, or the reason if failed.
     */
    train: function () {
        // Stop the learning.
        this.iter = this.type.total_iters;
        // Intialize the q-value table.
        this.table = new Array(this.type.states);
        for (var i = 0; i < this.type.states; ++i) {
            this.table[i] = new Array(this.type.actions);
            for (var j = 0; j < this.type.actions; ++j) {
                this.table[i][j] = 0.0;
            }
        }

        this.gameNumber = 0;
        this.resultTable = new Array(this.type.result_max_size);
        for (var i = 0; i < this.type.result_max_size; ++i) {
            this.resultTable[i] = new Array(2);
            for (var j = 0; j < 2; ++j) {
                this.resultTable[i][j] = 0;
            }
        }

        this.buffer_actions = new Array(this.type.buffer_size);
        this.buffer_states  = new Array(this.type.buffer_size);
        for(var i = 0; i < this.type.buffer_size; i++) {
            this.buffer_actions[i] = 0;
            this.buffer_states[i] = 0;
        }

        this.history = QLearner.initialResult;
        this.prev_ground_res = QLearner.initialResult;
        
        // Restart the training.
        this.iter = 0;
        return true;
    },

    /**
     * Take the best action of current state. Used internally.
     * @return {int}
     */
    act_: function (state) {
        var action = 0;
        var q = this.table[state][0];
        for (var i = 1; i < this.type.actions; ++i) {
            if (this.table[state][i] > q) {
                q = this.table[state][i];
                action = i;
            }
        }
        return action;
    },
    /**
     * Estimate the future value of state. Used internally.
     * Just max_a(q(s, a), a).
     * @return {float}
     */
    estimate_: function (state) {
        var action = this.act_(state);
        return this.table[state][action];
    },
    /**
     * Update the Q-Table. Used internally.
     * @return {void}
     */
    update_: function (state, action, reward, next_state) {
        var r = reward;
        if (r >= 0) {
            r += this.type.gamma * this.estimate_(next_state);
        }

        var before = this.table[state][action];

        this.table[state][action] += this.type.alpha *
            (r - this.table[state][action]);
            
        if(reward < 0) {
            console.log(state + " " + action + " " + reward + " " + next_state);
            console.log("table[%d][%d] %f -> %f", state, action, before, this.table[state][action]);
        }
    }
};

function printTable() {
    table = Runner.instance_.brain.table;
    console.log(Runner.instance_.tRex.jumping + " " + Runner.instance_.tRex.yPos + " " + Runner.instance_.tRex.jumpVelocity);
    for (var i = 1; i <= 10; i++) {
        //console.log("table[%d] NO: %f JUMP: %f", i, table[i][0], table[i][1]);
    }
}

// This is a hand craft AI.
function HandCraftAI() {
    this.results = [];
    this.iteration = 0;
    return this;
};

HandCraftAI.prototype = {
    act: function (runner, reward) {
        // Jump if necessary.
        var result = {
            state: null,
            action: QLearner.actions.NOTHING
        };
        if (runner.horizon.obstacles.length > 0) {
            var obstacle = runner.horizon.obstacles[0];
            var x = (obstacle.xPos + obstacle.width) / runner.dimensions.WIDTH;
            var y = obstacle.yPos / runner.dimensions.HEIGHT;
            console.log(y);
            // console.log("x %f y %f", x, y);
            var threshold = (runner.currentSpeed - 6) / 7 * 0.1 + 0.2;
            if (x < threshold && y > 0.4) {
                result.action = QLearner.actions.JUMP;
            }
        }
        this.iteration++;
        return result;
    },
    isTrain: function() {
        return false;
    },
    dump: function () {
        return null;
    },
    /**
     * Do nothing.
     * @return {boolean/string}
     * return true if succeed, or the reason if failed.
     */
    load: function (model) {
        return "Sorry no cheat sheet!";
    },
    appendResult: function(result) {
        this.results.push([this.iteration, result]);
    },
    dumpResult: function () {
        var csvContent = "";
        for(var i = 0; i < this.results.length; i++) {
            dataString = this.results[i].join(",");
            csvContent += i < this.results.length - 1 ? dataString + "\n" : dataString;
        }
        return { text: csvContent, fn: "result-dql.csv" };
    },
};

/**
 * Extract the luminance from the rgb.
 */
function rgb2l(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2;
    return l;
};

/**
 * Preprocess the frame. Extract the luminance channel.
 */
function preprocess(image) {
    var n = image.width * image.height;
    var lum = new Array(n);
    for (var i = 0; i < n; i++) {
        lum[i] = rgb2l(image.data[i * 4], image.data[i * 4 + 1], image.data[i * 4 + 2]);
    }
    return {
        width: image.width,
        height: image.height,
        data: lum
    };
};

function DeepQLearner(dimensions, container, type) {
    // Only show the image a quarter.
    this.dimensions = dimensions;
    this.canvas = null;
    this.canvasCtx = null;

    this.type = type;

    this.frames = 0;
    this.iteration = 0;
    this.previous_action = 0;

    this.brain = null;
    this.results = [];
    this.init(container);
    return this;
};

DeepQLearner.Configure = {
    WIDTH: 80,
    HEIGHT: 80
};

DeepQLearner.types = {
    /**
     * This neural network only take in the first obstacle's (xPos + width)
     */
    SingleObstacleX: {
        num_inputs: 1,
        num_actions: 2,
        opt: {
            temporal_window: 0,
            target_update_iteration: 5000,
            experience_size: 30000,
            start_learn_threshold: 1000,
            gamma: 0.99,
            learning_steps_total: 100000,
            learning_steps_burnin: 3000,
            epsilon_min: 0.01,
            epsilon_test_time: 0.00,
            layer_defs: [
                { type: 'input', out_sx: 1, out_sy: 1, out_depth: 1 },
                { type: 'fc', num_neurons: 32, activation: 'relu' },
                { type: 'fc', num_neurons: 32, activation: 'relu' },
                { type: 'regression', num_neurons: 2 }
            ],
            tdtrainer_options: {
                learning_rate: 0.001,
                momentum: 0.0,
                batch_size: 64,
                l2_decay: 0.01
            },
            random_action_distribution: [0.8, 0.2]
        },
        getInput: function (runner, brain) {
            var input = new Array(1);
            if (runner.horizon.obstacles.length > 0) {
                // Update the obstacles.
                var obstacle = runner.horizon.obstacles[0];
                input[0] = (obstacle.xPos + obstacle.width) / runner.dimensions.WIDTH;
            } else {
                input[0] = 1;
            }
            return input;
        }
    },
    SingleObstacleXS: {
        num_inputs: 2,
        num_actions: 2,
        opt: {
            temporal_window: 0,
            target_update_iteration: 5000,
            experience_size: 30000,
            start_learn_threshold: 1000,
            gamma: 0.99,
            learning_steps_total: 200000,
            learning_steps_burnin: 3000,
            epsilon_min: 0.01,
            epsilon_test_time: 0.00,
            layer_defs: [
                { type: 'input', out_sx: 1, out_sy: 1, out_depth: 2 },
                { type: 'fc', num_neurons: 64, activation: 'relu' },
                { type: 'fc', num_neurons: 64, activation: 'relu' },
                { type: 'regression', num_neurons: 2 }
            ],
            tdtrainer_options: {
                learning_rate: 0.001,
                momentum: 0.0,
                batch_size: 64,
                l2_decay: 0.01
            },
            random_action_distribution: [0.8, 0.2]
        },
        getInput: function (runner, brain) {
            var input = new Array(2);
            if (runner.horizon.obstacles.length > 0) {
                // Update the obstacles.
                var obstacle = runner.horizon.obstacles[0];
                input[0] = (obstacle.xPos + obstacle.width) / runner.dimensions.WIDTH;
                input[1] = (runner.currentSpeed - 6 + obstacle.speedOffset) / 8.0;
            } else {
                input[0] = 1;
                input[1] = 0;
            }
            return input;
        }
    },

    SingleObstacleXH: {
        num_inputs: 2,
        num_actions: 2,
        opt: {
            temporal_window: 0,
            target_update_iteration: 5000,
            experience_size: 30000,
            start_learn_threshold: 1000,
            gamma: 0.99,
            learning_steps_total: 200000,
            learning_steps_burnin: 3000,
            epsilon_min: 0.01,
            epsilon_test_time: 0.00,
            layer_defs: [
                { type: 'input', out_sx: 1, out_sy: 1, out_depth: 2 },
                { type: 'fc', num_neurons: 64, activation: 'relu' },
                { type: 'fc', num_neurons: 64, activation: 'relu' },
                { type: 'regression', num_neurons: 2 }
            ],
            tdtrainer_options: {
                learning_rate: 0.001,
                momentum: 0.0,
                batch_size: 64,
                l2_decay: 0.01
            },
            random_action_distribution: [0.8, 0.2]
        },
        getInput: function (runner, brain) {
            var input = new Array(2);
            if (runner.horizon.obstacles.length > 0) {
                // Update the obstacles.
                var obstacle = runner.horizon.obstacles[0];
                input[0] = (obstacle.xPos + obstacle.width) / runner.dimensions.WIDTH;
                input[1] = (100 - runner.tRex.yPos) / 100.0;
            } else {
                input[0] = 1;
                input[1] = 1;
            }
            return input;
        }
    },

    SingleObstacleXHS: {
        num_inputs: 3,
        num_actions: 2,
        opt: {
            temporal_window: 0,
            target_update_iteration: 5000,
            experience_size: 30000,
            start_learn_threshold: 1000,
            gamma: 0.99,
            learning_steps_total: 200000,
            learning_steps_burnin: 3000,
            epsilon_min: 0.01,
            epsilon_test_time: 0.00,
            layer_defs: [
                { type: 'input', out_sx: 1, out_sy: 1, out_depth: 3 },
                { type: 'fc', num_neurons: 64, activation: 'relu' },
                { type: 'fc', num_neurons: 64, activation: 'relu' },
                { type: 'regression', num_neurons: 2 }
            ],
            tdtrainer_options: {
                learning_rate: 0.001,
                momentum: 0.0,
                batch_size: 64,
                l2_decay: 0.01
            },
            random_action_distribution: [0.8, 0.2]
        },
        getInput: function (runner, brain) {
            var input = new Array(3);
            if (runner.horizon.obstacles.length > 0) {
                // Update the obstacles.
                var obstacle = runner.horizon.obstacles[0];
                input[0] = (obstacle.xPos + obstacle.width) / runner.dimensions.WIDTH;
                input[1] = (100 - runner.tRex.yPos) / 100.0;
                input[2] = (runner.currentSpeed - 6 + obstacle.speedOffset) / 8.0;
            } else {
                input[0] = 1;
                input[1] = 1;
                input[2] = 0;
            }
            return input;
        }
    },
    Visual: {
        num_inputs: 5,
        num_actions: 2,
        opt: {
            temporal_window: 0,
            target_update_iteration: 5000,
            experience_size: 30000,
            start_learn_threshold: 1000,
            gamma: 0.99,
            learning_steps_total: 200000,
            learning_steps_burnin: 3000,
            epsilon_min: 0.01,
            epsilon_test_time: 0.00,
            layer_defs: [
                { type: 'input', out_sx: 1, out_sy: 1, out_depth: 5 },
                { type: 'fc', num_neurons: 32, activation: 'relu' },
                { type: 'fc', num_neurons: 32, activation: 'relu' },
                { type: 'regression', num_neurons: 2 }
            ],
            tdtrainer_options: {
                learning_rate: 0.001,
                momentum: 0.0,
                batch_size: 64,
                l2_decay: 0.01
            },
            random_action_distribution: [0.7, 0.2, 0.1]
        },
        getInput: function (runner, brain) {

            brain.canvasCtx.clearRect(0, 0, brain.canvas.width, brain.canvas.height);
            brain.canvasCtx.drawImage(runner.canvas, 0, 0, brain.canvas.width, brain.canvas.height);
            // Get the resized data.
            var raw = brain.canvasCtx.getImageData(0, 0, brain.canvas.width, brain.canvas.height);
            // Preprocess this frame.
            var frame = preprocess(raw);

            var input = new Array(5);
            if (runner.horizon.obstacles.length > 0) {
                // Update the obstacles.
                var obstacle = runner.horizon.obstacles[0];
                input[0] = (obstacle.xPos) / runner.dimensions.WIDTH;
                input[1] = (obstacle.yPos) / runner.dimensions.HEIGHT;
                input[2] = (obstacle.width) / runner.dimensions.WIDTH;
            } else {
                input[0] = 1;
                input[1] = 1;
                input[2] = 1;
            }
            input[3] = runner.tRex.yPos / runner.dimensions.HEIGHT;
            input[4] = runner.tRex.jumpVelocity;
            if (runner.tRex.speedDrop) {
                input[4] *= runner.tRex.config.SPEED_DROP_COEFFICIENT;
            }
            return input;
        }
    }
};

DeepQLearner.prototype = {
    init: function (container) {

        var w = DeepQLearner.Configure.WIDTH;
        var h = DeepQLearner.Configure.HEIGHT;

        this.canvas = document.createElement('canvas');
        this.canvas.width = w;
        this.canvas.height = h;
        container.appendChild(this.canvas);
        this.canvasCtx = this.canvas.getContext('2d');

        this.reward_canvas = document.createElement('canvas');
        this.reward_canvas.width = 600;
        this.reward_canvas.height = 150;
        container.appendChild(this.reward_canvas);

        this.value_canvas = document.createElement('canvas');
        this.value_canvas.width = 600;
        this.value_canvas.height = 150;
        container.appendChild(this.value_canvas);

        this.brain = new deepqlearn.Brain(this.type.num_inputs, this.type.num_actions, this.type.opt);
        this.reward_graph = new cnnvis.Graph();
    },

    act: function (runner, reward) {

        // Get the action.
        // Update for every 6 frames. Otherwise, do nothing.
        // After training take action for each frame.
        var action = 0;
        if (this.frames % 6 == 0 || reward < 0 || !this.isTrain()) {
            // Notice that this is the reward for previous decision.
            if (this.iteration <= this.type.opt.learning_steps_total) {
                this.brain.backward(reward);
                this.iteration++;
            }
            var input = this.type.getInput(runner, this);
            action = this.brain.forward(input);
            this.previous_action = action;
        }
        this.frames++;
        if (this.frames > 100000) {
            this.frames = 0;
        }

        if (this.iteration % 200 == 0) {
            this.reward_graph.add(this.iteration / 200, this.brain.average_reward_window.get_average());
            this.reward_graph.drawSelf(this.reward_canvas);
        }

        document.getElementById("iteration-panel").innerHTML = "iteration: " + this.iteration;

        this.brain.visSelf(document.getElementById("DQL-brain"));

        // Some other visualization.
        if (this.type.num_inputs == 1 && this.iteration % 200 == 0) {
            var legend = ['not jumping', 'jumping'];
            var opt = {
                step_horizon: 1
            };
            var value_graph = new cnnvis.MultiGraph(legend, opt);
            for (var input = 0.0; input <= 1.0; input += 0.01) {
                var svol = new convnetjs.Vol(1, 1, 1);
                svol.w = [input];
                var action_values = this.brain.value_net.forward(svol);
                value_graph.add(input, action_values.w);
            }
            value_graph.drawSelf(this.value_canvas);
        }

        return {
            action: action,
            state: input
        };
    },

    isTrain: function() {
        return this.iteration < this.type.opt.learning_steps_total;
        // return false;
    },

    dump: function () {
        return {
            text: JSON.stringify(this.brain.value_net.toJSON()),
            fn: 'deep-q-net.txt'
        };
    },

    /**
     * Load the model and stop learning.
     * @return {boolean/string}
     * return true if succeed, or the reason if failed.
     */
    load: function (model) {
        this.brain.value_net.fromJSON(JSON.parse(model));
        this.brain.learning = false;
        return true;
    },

    appendResult: function(result) {
        this.results.push([this.iteration, result]);
    },
    dumpResult: function () {
        var csvContent = "";
        for(var i = 0; i < this.results.length; i++) {
            dataString = this.results[i].join(",");
            csvContent += i < this.results.length - 1 ? dataString + "\n" : dataString;
        }
        return { text: csvContent, fn: "result-dql.csv" };
    },
};
