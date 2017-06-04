// A dummy human agend which always do nothing.
// Always do nothing to let the player take control.
function Human() {
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
        return result;
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
        return "The model is in your mind!";
    }
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
        Math.floor(x / divider * timer) - 1,
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
        total_iters: 10000,
        states: 21,
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
                return 20;
            }
            var obstacle = runner.horizon.obstacles[0];
            var x = quantify(obstacle.xPos, runner.dimensions.WIDTH, 20, 0, 19);
            // var y = quantify(obstacle.yPos, runner.dimensions.HEIGHT, 10, 0, 9);
            // var w = quantify(obstacle.width, runner.dimensions.WIDTH / 4, 10, 0, 9);
            // var h = quantify(obstacle.typeConfig.height, runner.dimensions.HEIGHT / 4, 10, 0, 9);
            // var state = w * 1000 + h * 100 + y * 10 + x + 1;
            // var state = y * 100 + w * 10 + x + 1;
            var state = x;
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
        total_iters: 10000,
        states: 1001,
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
                return 1000;
            }
            var obstacle = runner.horizon.obstacles[0];
            var x = quantify(obstacle.xPos, runner.dimensions.WIDTH, 10, 0, 9);
            var y = quantify(obstacle.yPos, runner.dimensions.HEIGHT, 10, 0, 9);
            var w = quantify(obstacle.width, runner.dimensions.WIDTH / 4, 10, 0, 9);
            var state = y * 100 + w * 10 + x + 1;
            return state;
        }
    }
};

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
        if (this.iter < this.type.total_iters && (this.history.state != state || reward < 0)) {
            console.log(state);
            console.log("reward %d", reward);
            this.update_(this.history.state, this.history.action, reward, state);
            this.iter++;
            document.getElementById("iteration-panel").innerHTML = "iteration: " + this.iter;
            this.history = result;
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
        this.history = {
            action: QLearner.actions.NOTHING,
            state: 0
        };
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
        this.table[state][action] += this.type.alpha *
            (reward + this.type.gamma * this.estimate_(next_state) - this.table[state][action]);
    }
};

// This is a hand craft AI.
function HandCraftAI() {
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
        return result;
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
    }
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
    this.init(container);
    return this;
};

DeepQLearner.Configure = {
    WIDTH: 150,
    HEIGHT: 37
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
            learning_steps_total: 200000,
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
        getInput: function (runner) {
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
    SingleObstacleTRex: {
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
        getInput: function (runner) {
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
        // this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // this.canvasCtx.drawImage(runner.canvas, 0, 0, this.canvas.width, this.canvas.height);
        // // Get the resized data.
        // var raw = this.canvasCtx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        // // Preprocess this frame.
        // var frame = this.preprocess(raw);

        // Get the action.
        // Update for every 6 frames. Otherwise, repeat previous action.
        var action = 0;
        if (this.frames % 6 == 0 || reward < 0) {
            // Notice that this is the reward for previous decision.
            this.brain.backward(reward);
            var input = this.type.getInput(runner);
            action = this.brain.forward(input);
            this.previous_action = action;
            this.iteration++;
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

    dump: function () {
        return this.brain.value_net.toJSON();
    },

    /**
     * Load the model and stop learning.
     * @return {boolean/string}
     * return true if succeed, or the reason if failed.
     */
    load: function (model) {
        this.brain.value_net.fromJSON(model);
        this.brain.learning = false;
        return true;
    },

    /**
     * Preprocess the frame. Extract the luminance channel.
     */
    preprocess: function (image) {
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
    }
};


