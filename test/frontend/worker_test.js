/* global afterEach, beforeEach, chai, createPresenceSocket, describe,
   handlers, it, sinon, Port, PortCollection, _config:true, _presenceSocket,
   loadconfig, ports:true, _presenceSocketOnMessage, _presenceSocketOnError,
   _presenceSocketOnClose, _presenceSocketSendMessage:true,
   _presenceSocketOnOpen, _signinCallback, _presenceSocket, currentUsers:true,
   browserPort:true, _currentUserData:true, UserData, currentCall:true,
   serverHandlers */
/* jshint expr:true */
/* Needed due to the use of non-camelcase in the websocket topics */
/* jshint camelcase:false */
var expect = chai.expect;

describe('Worker', function() {
  "use strict";

  describe("#loadconfig", function() {
    var oldConfig, xhr, requests, sandbox;

    beforeEach(function() {
      oldConfig = _config;
      sandbox = sinon.sandbox.create();
      // XXX For some reason, sandbox.useFakeXMLHttpRequest doesn't want to work
      // nicely so we have to manually xhr.restore for now.
      xhr = sinon.useFakeXMLHttpRequest();
      _config = {};
      requests = [];
      xhr.onCreate = function (req) { requests.push(req); };
    });

    afterEach(function() {
      _config = oldConfig;
      xhr.restore();
      sandbox.restore();
    });

    it("should populate the _config object from using AJAX load",
      function(done) {
        expect(_config).to.deep.equal({});
        loadconfig(function(err, config) {
          expect(requests).to.have.length.of(1);
          expect(requests[0].url).to.equal('/config.json');
          expect(config).to.deep.equal({WSURL: 'ws://fake', DEBUG: true});
          done();
        });
        requests[0].respond(200, {
          'Content-Type': 'application/json'
        }, '{"WSURL": "ws://fake", "DEBUG": true}');
      });
  });

  describe('UserData', function() {
    it("should be created with defaults values", function() {
      var userData = new UserData();
      expect(userData).to.include.keys(Object.keys(userData.defaults));
    });

    it("should accept initial values", function() {
      var userData = new UserData({displayName: "foo"});
      expect(userData).to.include.keys(Object.keys(userData.defaults));
      expect(userData.displayName).to.equal("foo");
    });

    it("should accept a configuration object and update defaults accordingly",
      function() {
        var userData = new UserData({}, {ROOTURL: "http://fake"});
        expect(userData.iconURL).to.equal("http://fake/talkilla16.png");
      });

    it("should reset to defaults", function() {
      var userData = new UserData({displayName: "foo"});
      expect(userData.displayName).to.equal("foo");
      userData.reset();
      expect(userData).to.include.keys(Object.keys(userData.defaults));
      expect(userData.displayName).to.equal(undefined);
    });
  });

  describe('presence socket stuff', function () {
    var spy1;
    var port;
    // XXX change shoulds & impls to refer to all ports, rather than a single
    // port, since that's what's being implemented and what we actually want.
    // This probably implies changes to the tests themselves, since that's
    // not what we're currently testing for.

    beforeEach(function() {
      spy1 = sinon.spy();
      port = new Port({_portid: 1, postMessage: spy1});
      ports.add(port);
    });

    afterEach(function() {
      ports.remove(port);
    });

    describe('#createPresenceSocket', function() {
      var sandbox;
      var wsurl = "ws://example.com/";

      beforeEach(function() {
        sandbox = sinon.sandbox.create();
        _config.WSURL = wsurl;
        sandbox.stub(window, "WebSocket");
      });

      afterEach(function() {
        sandbox.restore();
      });

      it("should configure a socket with a URL from the nick and _config.WSURL",
        function() {
          expect(_presenceSocket).to.equal(undefined);

          var nickname = "bill";
          createPresenceSocket(nickname);

          expect(_presenceSocket).to.be.an.instanceOf(WebSocket);

          sinon.assert.calledOnce(WebSocket);
          sinon.assert.calledWithExactly(WebSocket,
            wsurl + "?nick=" + nickname);
          expect(_presenceSocket.onopen).to.equal(_presenceSocketOnOpen);
          expect(_presenceSocket.onmessage).to.equal(_presenceSocketOnMessage);
          expect(_presenceSocket.onerror).to.equal(_presenceSocketOnError);
          expect(_presenceSocket.onclose).to.equal(_presenceSocketOnClose);
        });

      it("should post a talkilla.presence-pending message",
        function() {
          createPresenceSocket("larry");
          sinon.assert.calledOnce(spy1);
          sinon.assert.calledWithExactly(spy1,
            {data: {}, topic: "talkilla.presence-pending"});
        });
    });

    describe('#_presenceSocketOnOpen', function() {
      it('should post a talkilla.presence-open message',
        function() {
          var event = {foo: "bar"};
          _presenceSocketOnOpen(event);

          sinon.assert.calledOnce(spy1);
          sinon.assert.calledWithExactly(spy1,
            {data: event, topic: "talkilla.presence-open"});
        });
    });

    describe('#_presenceSocketOnMessage', function() {
      var sandbox;

      beforeEach(function() {
        sandbox = sinon.sandbox.create();
      });

      afterEach(function() {
        sandbox.restore();
      });

      it("should call postMessage with a JSON version of the received message",
        function() {
          var event = {
            data: JSON.stringify({
              topic: "bar"
            })
          };
          _presenceSocketOnMessage(event);
          sinon.assert.calledOnce(spy1);
          sinon.assert.calledWithExactly(spy1, {data: "bar",
                                                topic: "talkilla.topic"});
        });

      it("should handle incoming-call internally",
        function() {
          sandbox.stub(serverHandlers, 'incoming_call');
          var event = {
            data: JSON.stringify({
              incoming_call: "bar"
            })
          };
          _presenceSocketOnMessage(event);
          sinon.assert.calledOnce(serverHandlers.incoming_call);
        });
    });

    describe('#_presenceSocketSendMessage', function() {
      var sandbox, dummySocket;
      var wsurl = "ws://example.com/";

      beforeEach(function() {
        sandbox = sinon.sandbox.create();
        _config.WSURL = wsurl;
        dummySocket = { send: sandbox.spy() };
        sandbox.stub(window, "WebSocket").returns(dummySocket);
      });

      afterEach(function() {
        sandbox.restore();
      });

      it("should send a message to the WebSocket with the supplied string",
        function() {
          var data = "test";
          createPresenceSocket("larry");
          _presenceSocketSendMessage(data);
          sinon.assert.calledWith(dummySocket.send, data);
        });
    });

    describe('#_presenceSocketOnError', function() {
      it('should call postMessage with a talkilla.websocket-error message',
        function() {
          var event = {foo: "bar"};
          _presenceSocketOnError(event);

          sinon.assert.calledOnce(spy1);
          sinon.assert.calledWithExactly(spy1,
            {data: event, topic: "talkilla.websocket-error"});
        });
    });

    describe("#_presenceSocketOnClose", function() {
      it('should post a talkilla.presence-unavailable message',
        function() {
          var event = {code: 1000};
          _presenceSocketOnClose(event);

          sinon.assert.calledOnce(spy1);
          sinon.assert.calledWithExactly(spy1,
            {data: 1000, topic: "talkilla.presence-unavailable"});
        }
      );

      // XXX should we define behavior that is more than simple proxying
      // of the CloseEvent?  E.g. should we null out _presenceSocket?
      // Some first thoughts from Standard8 & dmose at
      // <https://webrtc-apps.etherpad.mozilla.org/35>
    });

  });

  describe('Port', function() {
    it("should accept and configure a port", function() {
      var port = new Port({_portid: 1});
      expect(port.id).to.equal(1);
      expect(port.port.onmessage).to.be.a('function');
    });

    it("should post a message", function() {
      var spy = sinon.spy();
      var port = new Port({_portid: 1, postMessage: spy});
      port.postEvent('foo', 'bar');
      expect(spy.calledWith({topic: 'foo', data: 'bar'})).to.be.ok;
    });

    it("should post an error", function() {
      var spy = sinon.spy();
      var port = new Port({_portid: 1, postMessage: spy});
      port.error('error');
      expect(spy.calledWith({topic: 'talkilla.error', data: 'error'})).to.be.ok;
    });
  });

  describe('PortCollection', function() {
    it("should have empty port stack by default", function() {
      expect(new PortCollection().ports).to.deep.equal({});
    });

    it("should add a configured port to the stack", function() {
      var coll = new PortCollection();
      expect(coll.ports).to.be.a('object');
      expect(Object.keys(coll.ports)).to.have.length.of(0);
      coll.add(new Port({_portid: 1}));
      expect(Object.keys(coll.ports)).to.have.length.of(1);
      expect(coll.ports[1]).to.be.a('object');
      expect(coll.ports[1]).to.include.keys(['port', 'id']);
    });

    it("should find a port by its identifier", function() {
      var coll = new PortCollection();
      coll.add(new Port({_portid: 1}));
      coll.add(new Port({_portid: 42}));
      expect(coll.find(1).id).to.equal(1);
      expect(coll.find(42).id).to.equal(42);
      expect(coll.find(99)).to.be.a('undefined');
    });

    it("should not add the same port twice", function() {
      var coll = new PortCollection();
      var port = new Port({_portid: 1});
      coll.add(port);
      coll.add(port);
      expect(Object.keys(coll.ports)).to.have.length.of(1);
    });

    it("should be able to remove a port from the collection", function() {
      var coll = new PortCollection();
      var port1 = new Port({_portid: 1});
      coll.add(port1);
      coll.add(new Port({_portid: 2}));
      expect(Object.keys(coll.ports)).to.have.length.of(2);
      coll.remove(port1);
      expect(Object.keys(coll.ports)).to.have.length.of(1);
    });

    it("should find a port and post a message to it", function() {
      var coll = new PortCollection();
      var spy1 = sinon.spy();
      var spy2 = sinon.spy();
      coll.add(new Port({_portid: 1, postMessage: spy1}));
      coll.add(new Port({_portid: 2, postMessage: spy2}));
      coll.find(2).postEvent('foo', 'bar');
      expect(spy1.called).to.equal(false);
      expect(spy2.calledWith({topic: 'foo', data: 'bar'})).to.be.ok;
    });

    it("should broadcast a message to all ports", function() {
      var coll = new PortCollection();
      var spy1 = sinon.spy();
      var spy2 = sinon.spy();
      coll.add(new Port({_portid: 1, postMessage: spy1}));
      coll.add(new Port({_portid: 2, postMessage: spy2}));
      coll.broadcastEvent('foo', 'bar');
      expect(spy1.calledWith({topic: 'foo', data: 'bar'})).to.be.ok;
      expect(spy2.calledWith({topic: 'foo', data: 'bar'})).to.be.ok;
    });

    it("should broadcast an error to all ports", function() {
      var coll = new PortCollection();
      var spy1 = sinon.spy();
      var spy2 = sinon.spy();
      coll.add(new Port({_portid: 1, postMessage: spy1}));
      coll.add(new Port({_portid: 2, postMessage: spy2}));
      coll.broadcastError('error');
      expect(spy1.calledWith({topic: 'talkilla.error',
                              data: 'error'})).to.be.ok;
      expect(spy2.calledWith({topic: 'talkilla.error',
                              data: 'error'})).to.be.ok;
    });
  });

  describe('Handlers', function() {
    it("should remove a closed port from the current collection", function() {
      ports = new PortCollection();
      var port = new Port({_portid: 42});
      ports.add(port);
      handlers['social.port-closing'].bind(port)();
      expect(Object.keys(ports.ports)).to.have.length.of(0);
    });
  });

  describe("#_signinCallback", function() {
    var sandbox, socketStub, wsurl = 'ws://fake', testableCallback;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      sandbox.stub(window, "WebSocket");
      socketStub = sinon.stub(window, "createPresenceSocket");
      browserPort = {
        postEvent: sandbox.spy()
      };
      _config.WSURL = wsurl;
      _currentUserData = new UserData({});
      testableCallback = _signinCallback.bind({postEvent: function(){}});
    });

    afterEach(function() {
      browserPort = undefined;
      sandbox.restore();
      socketStub.restore();
    });

    it("should initiate the presence connection if signin succeded",
      function() {
        var nickname = "bill";
        testableCallback(null, JSON.stringify({nick: nickname}));
        sinon.assert.calledOnce(socketStub);
        sinon.assert.calledWithExactly(socketStub, nickname);
      });

    it("should not initiate the presence connection if signin failed",
      function() {
        var nickname;
        testableCallback(null, JSON.stringify({nick: nickname}));
        sinon.assert.notCalled(socketStub);
      });
  });

  describe("#login", function() {
    var xhr, rootURL, socketStub, requests, sandbox;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      socketStub = sinon.stub(window, "createPresenceSocket");
      // XXX For some reason, sandbox.useFakeXMLHttpRequest doesn't want to work
      // nicely so we have to manually xhr.restore for now.
      xhr = sinon.useFakeXMLHttpRequest();
      requests = [];
      xhr.onCreate = function (req) { requests.push(req); };

      browserPort = {
        postEvent: sandbox.spy()
      };

      rootURL = 'http://fake';
      _currentUserData = new UserData({}, {
        ROOTURL: rootURL
      });
    });

    afterEach(function() {
      browserPort = undefined;
      xhr.restore();
      sandbox.restore();
      socketStub.restore();
    });

    it("should call postEvent with a failure message if i pass in bad data",
      function() {
        handlers.postEvent = sandbox.spy();
        handlers['talkilla.login']({topic: "talkilla.login", data: null});
        sinon.assert.calledOnce(handlers.postEvent);
        sinon.assert.calledWith(handlers.postEvent, "talkilla.login-failure");
      });

    it("should call postEvent with a pending message if I pass in valid data",
      function() {
        handlers.postEvent = sandbox.spy();
        handlers['talkilla.login']({
          topic: "talkilla.login",
          data: {username: "jb"}
        });
        sinon.assert.calledOnce(handlers.postEvent);
        sinon.assert.calledWith(handlers.postEvent, "talkilla.login-pending");
      });

    it("should post an ajax message to the server if I pass valid login data",
      function() {
        handlers['talkilla.login']({
          topic: "talkilla.login",
          data: {username: "jb"}
        });
        expect(requests.length).to.equal(1);
        expect(requests[0].url).to.equal('/signin');
        expect(requests[0].requestBody).to.be.not.empty;
        expect(requests[0].requestBody).to.be.equal('{"nick":"jb"}');
      });

    it("should post a social.user-profile message if the server accepted " +
       "login", function() {
        handlers['talkilla.login']({
          topic: "talkilla.login",
          data: {username: "jb"}
        });
        expect(requests.length).to.equal(1);

        requests[0].respond(200, { 'Content-Type': 'application/json' },
          '{"nick":"jb"}' );

        sinon.assert.calledOnce(browserPort.postEvent);
        var args = browserPort.postEvent.args;
        expect(args[0][1].userName).to.be.equal('jb');
        expect(args[0][1].iconURL).to.contain(rootURL + '/talkilla16.png');
        expect(args[0][1].profileURL).to.contain(rootURL + '/user.html');
      });

    it("should post a success message if the server accepted login",
      function() {
        var port = {id: "tests", postEvent: sandbox.spy()};
        ports.add(port);
        handlers['talkilla.login']({
          topic: "talkilla.login",
          data: {username: "jb"}
        });
        expect(requests.length).to.equal(1);

        requests[0].respond(200, { 'Content-Type': 'application/json' },
          '{"nick":"jb"}' );

        sinon.assert.calledOnce(port.postEvent);
        sinon.assert.calledWith(port.postEvent, "talkilla.login-success");
        ports.remove(port);
      });

    it("should store the username if the server accepted login",
      function() {
        handlers['talkilla.login']({
          topic: 'talkilla.login',
          data: {username: 'jb'}
        });
        expect(requests.length).to.equal(1);

        requests[0].respond(200, { 'Content-Type': 'application/json' },
          '{"nick":"jb"}' );

        expect(_currentUserData.userName).to.equal('jb');
      });

    it("should notify new sidebars of the logged in user",
      function() {
        _currentUserData.userName = "jb";
        handlers.postEvent = sinon.spy();
        handlers['talkilla.sidebar-ready']({
          topic: "talkilla.sidebar-ready",
          data: {}
        });

        sinon.assert.calledWith(handlers.postEvent, "talkilla.login-success");
      });

    it("should notify new sidebars of current users",
      function() {
        _currentUserData.userName = "jb";
        currentUsers = {};
        handlers.postEvent = sinon.spy();
        handlers['talkilla.sidebar-ready']({
          topic: "talkilla.sidebar-ready",
          data: {}
        });

        sinon.assert.calledWith(handlers.postEvent, "talkilla.users");
      });

    it("should notify new sidebars only if there's a logged in user",
      function() {
        handlers.postEvent = sinon.spy();
        handlers['talkilla.sidebar-ready']({
          topic: "talkilla.sidebar-ready",
          data: {}
        });

        sinon.assert.notCalled(handlers.postEvent);
      });

    it("should post a fail message if the server rejected login",
      function() {
        handlers.postEvent = sinon.spy();
        handlers['talkilla.login']({
          topic: "talkilla.login",
          data: {username: "jb"}
        });
        expect(requests.length).to.equal(1);

        requests[0].respond(401, { 'Content-Type': 'text/plain' },
                            'Not Authorised' );

        sinon.assert.calledTwice(handlers.postEvent);
        sinon.assert.calledWith(handlers.postEvent, "talkilla.login-failure");
      });
  });

  describe("#logout", function() {
    var sandbox, xhr, requests;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      // XXX For some reason, sandbox.useFakeXMLHttpRequest doesn't want to work
      // nicely so we have to manually xhr.restore for now.
      xhr = sinon.useFakeXMLHttpRequest();
      requests = [];
      xhr.onCreate = function (req) { requests.push(req); };

      _currentUserData.userName = 'romain';
      _presenceSocket.close = sandbox.stub();

      browserPort = {
        postEvent: sandbox.spy()
      };
    });

    afterEach(function() {
      browserPort = undefined;
      xhr.restore();
      sandbox.restore();
    });

    it('should post an error message if not logged in', function() {
      _currentUserData.userName = undefined;
      handlers.postEvent = sandbox.spy();
      handlers['talkilla.logout']({
        topic: 'talkilla.logout',
        data: null
      });

      sinon.assert.calledOnce(handlers.postEvent);
      sinon.assert.calledWith(handlers.postEvent, 'talkilla.error');
    });

    it('should tear down the websocket', function() {
      handlers['talkilla.logout']({
        topic: 'talkilla.logout',
        data: null
      });

      sinon.assert.calledOnce(_presenceSocket.close);
    });

    it("should post an ajax message to the server",
      function() {
        handlers['talkilla.logout']({
          topic: 'talkilla.logout'
        });
        expect(requests.length).to.equal(1);
        expect(requests[0].url).to.equal('/signout');
        expect(requests[0].requestBody).to.be.not.empty;
        expect(requests[0].requestBody).to.be.equal('{"nick":"romain"}');
      });

    it("should post a success message",
      function() {
        var port = {id: "tests", postEvent: sandbox.spy()};
        ports.add(port);
        handlers['talkilla.logout']({
          topic: 'talkilla.logout'
        });

        requests[0].respond(200, { 'Content-Type': 'text/plain' },
          'OK' );

        sinon.assert.calledOnce(port.postEvent);
        sinon.assert.calledWith(port.postEvent, 'talkilla.logout-success');
        ports.remove(port);
      });

    it("should post a social.user-profile message", function() {
        handlers['talkilla.logout']({
          topic: 'talkilla.logout'
        });
        expect(requests.length).to.equal(1);

        requests[0].respond(200, { 'Content-Type': 'text/plain' },
          'OK' );

        var spy = browserPort.postEvent;
        sinon.assert.calledOnce(spy);
        expect(spy.args[0][1].userName).to.be.equal(undefined);
      });


    it("should log failure, if the server failed to sign the user out",
      function() {
        handlers.postEvent = sandbox.spy();
        handlers['talkilla.logout']({
          topic: 'talkilla.logout'
        });

        expect(requests.length).to.equal(1);

        requests[0].respond(401, { 'Content-Type': 'text/plain' },
                            'Not Authorised' );

        sinon.assert.calledOnce(handlers.postEvent);
        sinon.assert.calledWith(handlers.postEvent, 'talkilla.error');
      });
  });

  describe("talkilla.call-start", function() {
    var sandbox;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      browserPort = {postEvent: sandbox.spy()};
    });

    afterEach(function() {
      browserPort = undefined;
      sandbox.restore();
    });

    it("should open a chat window when receiving a talkilla.call-start event",
      function() {
        handlers.postEvent = sinon.spy();
        handlers['talkilla.call-start']({
          topic: "talkilla.call-start",
          data: {}
        });

        sinon.assert.calledOnce(browserPort.postEvent);
        sinon.assert.calledWithExactly(browserPort.postEvent,
          'social.request-chat', "chat.html");
      });
  });

  describe("talkilla.call-window-ready", function() {
    var sandbox;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      browserPort = {postEvent: sandbox.spy()};
    });

    afterEach(function() {
      browserPort = undefined;
      sandbox.restore();
    });

    it("should post a talkilla.call-start event when " +
      "receiving a talkilla.chat-window-ready for an outgoing call",
      function () {
        var chatAppPort = {postEvent: sinon.spy()};
        currentCall = {
          port: chatAppPort,
          data: {
            caller: "alice",
            callee: "bob"
          }
        };

        handlers['talkilla.chat-window-ready'].bind(chatAppPort)({
          topic: "talkilla.chat-window-ready",
          data: {}
        });

        sinon.assert.calledOnce(chatAppPort.postEvent);
        sinon.assert.calledWithExactly(chatAppPort.postEvent,
          'talkilla.call-start', currentCall.data);
      });

    it("should post a talkilla.call-incoming event when " +
      "receiving a talkilla.chat-window-ready for an incoming call",
       function () {
        var chatAppPort = {postEvent: sinon.spy()};
        currentCall = {
          port: undefined,
          data: {
            caller: "alice",
            callee: "bob",
            offer: {type: "fake", sdp: "sdp"}
          }
        };

        handlers['talkilla.chat-window-ready'].bind(chatAppPort)({
          topic: "talkilla.chat-window-ready",
          data: {}
        });

        sinon.assert.calledOnce(chatAppPort.postEvent);
        sinon.assert.calledWithExactly(chatAppPort.postEvent,
          'talkilla.call-incoming', currentCall.data);
      });

    it("should store the current port when " +
      "receiving a talkilla.chat-window-ready for an outgoing call",
      function () {
        var port = {postEvent: sinon.spy()};
        currentCall = {port: undefined, data: {caller: "alice", callee: "bob"}};

        handlers['talkilla.chat-window-ready'].bind(port)({
          topic: "talkilla.chat-window-ready",
          data: {}
        });

        expect(currentCall.port).to.be.equal(port);
      });
  });

  describe("Call offers and answers", function() {
    var sandbox;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      browserPort = {postEvent: sandbox.spy()};
    });

    afterEach(function() {
      browserPort = undefined;
      sandbox.restore();
    });

    it("should send a websocket message when receiving talkilla.call-offer",
      function() {
        _presenceSocketSendMessage = sandbox.spy();
        var data = {
          caller: "fred",
          callee: "tom",
          offer: { sdp: "sdp", type: "type" }
        };

        handlers['talkilla.call-offer']({
          topic: "talkilla.call-offer",
          data: data
        });

        sinon.assert.calledOnce(_presenceSocketSendMessage);
        sinon.assert.calledWithExactly(_presenceSocketSendMessage,
         JSON.stringify({'call_offer': data }));
      });

    it("should send a websocket message when receiving talkilla.call-answer",
      function() {
        _presenceSocketSendMessage = sandbox.spy();
        var data = {
          caller: "fred",
          callee: "tom",
          offer: { sdp: "sdp", type: "type" }
        };

        handlers['talkilla.call-answer']({
          topic: "talkilla.call-answer",
          data: data
        });

        sinon.assert.calledOnce(_presenceSocketSendMessage);
        sinon.assert.calledWithExactly(_presenceSocketSendMessage,
         JSON.stringify({ 'call_accepted': data }));
      });

    it("should send a websocket message when receiving talkilla.call-hangup",
      function() {
        _presenceSocketSendMessage = sandbox.spy();
        var data = {
          other: "florian"
        };

        handlers['talkilla.call-hangup']({
          topic: "talkilla.call-hangup",
          data: data
        });

        sinon.assert.calledOnce(_presenceSocketSendMessage);
        sinon.assert.calledWithExactly(_presenceSocketSendMessage,
         JSON.stringify({ 'call_hangup': data }));
      });

    it("should reset the call data when receiving talkilla.call-hangup",
      function() {
        currentCall = {
          port: {},
          data: { caller: "romain", callee: "florian" }
        };
        _presenceSocketSendMessage = sandbox.spy();
        var data = {
          other: "florian"
        };

        handlers['talkilla.call-hangup']({
          topic: "talkilla.call-hangup",
          data: data
        });

        expect(currentCall).to.be.equal(undefined);
      });
  });

  describe("#incoming_call", function() {
    var sandbox;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      browserPort = {postEvent: sandbox.spy()};
    });

    afterEach(function() {
      browserPort = undefined;
      sandbox.restore();
    });

    it("should store the current call data", function() {
      var data = {
        caller: "bob",
        callee: "alice",
        offer: {type: "fake", sdp: "sdp" }
      };
      serverHandlers.incoming_call(data);

      expect(currentCall).to.deep.equal({port: undefined, data: data});
    });

    it("should open a chat window", function() {
      serverHandlers.incoming_call({});

      sinon.assert.calledOnce(browserPort.postEvent);
      sinon.assert.calledWithExactly(browserPort.postEvent,
        'social.request-chat', "chat.html");
    });
  });

  describe("#call_accepted", function() {
    var sandbox;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
      sandbox.restore();
    });

    it("should post talkilla.call-establishment to the chat window",
      function() {
        var port = {postEvent: sinon.spy()};
        var data = {
          caller: "alice",
          callee: "bob",
          answer: { type: "fake", sdp: "sdp" }
        };

        currentCall = {port: port, data: {caller: "alice", callee: "bob"}};

        serverHandlers.call_accepted(data);

        sinon.assert.calledOnce(port.postEvent);
        sinon.assert.calledWithExactly(port.postEvent,
          'talkilla.call-establishment', data);
      });
  });

  describe("#call_hangup", function() {
    var sandbox, callData;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      browserPort = {postEvent: sandbox.spy()};
      handlers.postEvent = sandbox.spy();
      callData = {
        other: "bob"
      };
      currentCall = {port: {postEvent: handlers.postEvent}, data: callData};
    });

    afterEach(function() {
      browserPort = undefined;
      sandbox.restore();
    });

    it("should notify the chat window", function() {
      serverHandlers.call_hangup(callData);

      sinon.assert.calledOnce(handlers.postEvent);
      sinon.assert.calledWithExactly(handlers.postEvent,
        'talkilla.call-hangup', callData);
    });

    it("should clear the current call data", function() {
      serverHandlers.call_hangup(callData);

      expect(currentCall).to.be.equal(undefined);
    });
  });
});
