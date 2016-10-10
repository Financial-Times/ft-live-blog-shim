import route from 'boulevard';
import url from 'url';
import rawBody from 'raw-body';
import qs from 'qs';
import {send} from 'micro';
import cookie from 'cookie';

const formBody = req => rawBody(req, {encoding: 'utf8'}).then(qs.parse);
const redirect = (res, location, status = 302) => {
	res.setHeader('location', location);
	return send(res, status, `Redirected to ${location}`);
};

const blogs = {};

const html = (res, t, status = 200) => {
	res.setHeader('content-type', 'text/html;charset=utf-8');
	send(res, status, t);
};

const cookies = req => cookie.parse(req.headers.cookie || '');
const setCookies = (res, cookies) => Object.keys(cookies).forEach(
	key => res.setHeader('set-cookie', cookie.serialize(key, cookies[key]))
);

const blogForm = (id = '', {title = '', excerpt = ''} = {}) => `<form action="/blog/${id}" method="POST">
	<input value="${title}" name="title" placeholder="Title">
	<input value="${excerpt}" name="excerpt" placeholder="Excerpt">
	<input type="submit" value="Update title">
</form>`;

export default route({
	'/' (req, res) {
		const {authorName = ''} = cookies(req);

		return html(res, `
		<form action="/author" method="GET">
			<input name="name" placeholder="Author name" value="${authorName}">
			<input type="submit" value="Change author name">
		</form>
		<ul>
			${Object.keys(blogs).map(key => `<li><a href="/blog/${key}">${blogs[key].meta.title}</a></li>`).join('\n')}
			<li>Create blog: ${blogForm()}</li>
		</ul>`);
	},

	'/author' (req, res) {
		const {query = {}} = url.parse(req.url, true);

		setCookies(res, {
			authorName: query.name
		});

		return redirect(res, '/');
	},

	async '/blog' (req, res) {
		switch(req.method) {
			case 'POST': {
				const id = Math.floor(Math.random() * 0xffffffffff).toString(36);
				const body = await formBody(req);
				blogs[id] = {
					catchup: [],
					config: {
						baseurl: `${process.env.NOW_URL || 'http://localhost:3000'}/blog/${id}`,
						authornamestyle: 'full',
						contentorder: 'descending',
					},
					meta: {
						title: body.title,
						excerpt: body.excerpt,
						status: 'pending',
					}
				};

				return redirect(res, `/blog/${id}`);
			}
		}
	},

	async '/blog/:id' (req, res, params) {
		const blog = blogs[params.id];
		if(!blog) return html(res, `<a href="/">↩</a> blog ${params.id} not found`, 404);

		switch(req.method) {
			default: {
				const {query = {}} = url.parse(req.url, true);

				switch(query.action) {
					case 'catchup': {
						return blog.catchup;
					}

					case 'getconfig': {
						return blog.config;
					}

					case 'getmeta': {
						return blog.meta;
					}

					default: {
						return html(res, `
							<a href="/">↩</a>
							<article>
							${blogForm(params.id, blog.meta)}

							<hr>
							<ul>
							${blog.catchup.map(event => {
								if(event.event === 'msg') return `<li><b>${event.data.authordisplayname}</b> ${event.data.textrendered}</li>`;
							}).join('\n')}
							<li>
								<form action="/blog/${params.id}/post" method="POST">
									<input name="msg" placeholder="Message"><input type="submit" value="+">
								</form>
							</li>
							</ul>
						</article>`);
					}
				}
			}
		}
	},

	async '/blog/:id/post' (req, res, params) {
		const blog = blogs[params.id];
		if(!blog) return html(res, `<a href="/">↩</a> blog ${params.id} not found`, 404);

		switch(req.method) {
			case 'POST': {
				const {authorName = 'Unknown'} = cookies(req);
				const body = await formBody(req);
				blog.catchup.push({
					event: 'msg',
					data: {
						mid: blog.catchup.length,
						textrendered: body.msg,
						emb: Math.floor(Date.now() / 1000),
						datemodified: Math.floor(Date.now() / 1000),
						authordisplayname: authorName,
						author: authorName.split(' ').map(p => p[0].toUpperCase()).join(''),
						authornamestyle: 'full',
					},
				});

				return redirect(res, `/blog/${params.id}`);
			}
		}
	}

});
