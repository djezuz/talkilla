/* global describe, it, beforeEach, afterEach */
/* jshint expr:true */

var expect = require('chai').expect;
var request = require('request');
var server = require('../server').server;
var findNewNick = require("../server").findNewNick;

var connection;

describe("Server", function() {
  describe("presence", function() {

    function signin(nick, callback) {
      request.post('http://localhost:3000/signin',
                   {form: {nick: nick}},
                   callback);
    }

    function signout(nick, callback) {
      request.post('http://localhost:3000/signout',
                   {form: {nick: nick}},
                   callback);
    }

    beforeEach(function() {
      connection = server.listen(3000);
    });

    afterEach(function() {
      connection.close();
    });

    it("should have no users logged in at startup", function() {
      expect(server.get("users")).to.be.empty;
    });

    it('should have foo logged in', function(done) {
      signin('foo', function() {
        expect(server.get('users')).to.eql(['foo']);
        done();
      });
    });

    it('should have no users logged in after logging in and out', 
    function(done) {
      signin('foo', function() {
        signout('foo', function() {
          expect(server.get('users')).to.be.empty;
          done();
        });
      });
    });

    it("should return the user's nick", function(done) {
      var nick1 = 'foo';
      signin('foo', function(err, res, body) {
        var data = JSON.parse(body);
        expect(data.nick).to.eql(nick1);
        expect(data.users).to.be.empty;
        done();
      });
    });

    it("should fix the user's nick if it already exists", function(done) {
      var nick1 = 'foo';
      /* jshint unused: vars */
      signin(nick1, function(err, res, body) {
        signin(nick1, function(err, res, body) {
          expect(JSON.parse(body).nick).to.eql(findNewNick(nick1));
          done();
        });
      });
    });

    it("should preserve existing chars of the nick when finding a new one",
       function() {
      var testNicks = {
        "foo": "foo1",
        "foo1": "foo2",
        "foo10": "foo11",
        "foo0": "foo1",
        "foo01": "foo02",
        "foo09": "foo10",

        // Now put a number in the "first part".
        "fo1o": "fo1o1",
        "fo1o1": "fo1o2",
        "fo1o10": "fo1o11",
        "fo1o0": "fo1o1",
        "fo1o01": "fo1o02",
        "fo1o09": "fo1o10"
      };
      for (var nick in testNicks)
        expect(findNewNick(nick)).to.equal(testNicks[nick]);
    });

    it("should return existing users", function(done) {
      var nick1 = "foo";
      var nick2 = "bar";
      signin(nick1, function() {
          signin(nick2, function(err, res, body) {
            var data = JSON.parse(body);
            expect(data.nick).to.eql(nick2);
            expect(data.users).to.eql([nick1]);
            done();
          });
        });
    });
  });
});